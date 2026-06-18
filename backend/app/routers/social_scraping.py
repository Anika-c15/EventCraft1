import asyncio
import datetime
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel

from ..database import get_db, SessionLocal
from ..auth import require_committee
from .. import models, schemas
from ..models import Event, Team, SocialPost
from ..config import settings
from ..ws import broadcast
from ..supabase_storage import upload_screenshot
from ..llm import generate_social_campaign_summary
from ..rate_limiter import limiter

router = APIRouter(prefix="/api/events/{event_id}/social-scraping", tags=["social-scraping"])

DEFAULT_SOCIAL_CONFIG = {
    "enabled": False,
    "platforms": ["twitter", "linkedin"],
    "poll_type": "hybrid",
    "poll_duration_minutes": 1440,
    "auto_post_on_evaluation": False,
    "auto_fetch_on_completion": True,
    "min_vote_threshold": 30
}


class PostVerifyPayload(BaseModel):
    likes: int
    shares: int
    approve: bool


def check_social_scraping_allowed(event_id: str, db: Session):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    social_weight = 0.15
    if event.scoring_weights:
        social_weight = event.scoring_weights.get("social", 0.15)
    if social_weight == 0:
        raise HTTPException(400, "Social scraping is not allowed because its scoring weight is set to 0%")


@router.get("/config")
@limiter.limit("30/minute")
def get_social_config(request: Request, event_id: str, db: Session = Depends(get_db), _: models.User = Depends(require_committee)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    config = (event.pipeline_config or {}).get("social_scraping", DEFAULT_SOCIAL_CONFIG)
    
    social_weight = 0.15
    if event.scoring_weights:
        social_weight = event.scoring_weights.get("social", 0.15)
        
    if social_weight == 0:
        config = {**config, "enabled": False, "social_weight": 0.0}
    else:
        # Dynamically enable if the current stage is the evaluation stage
        from ..llm import check_stage_is_evaluation_phase
        active_stage = db.query(models.PipelineStage).filter(
            models.PipelineStage.event_id == event_id,
            models.PipelineStage.status == models.StageStatus.active
        ).first()
        is_evaluation_stage = False
        if active_stage:
            if getattr(active_stage, "is_evaluation", False):
                is_evaluation_stage = True
            else:
                is_evaluation_stage = check_stage_is_evaluation_phase(active_stage.name, active_stage.description or "")
                
        if is_evaluation_stage:
            config = {**config, "enabled": True}
        config = {**config, "social_weight": social_weight}
        
    return config


@router.put("/config")
@limiter.limit("10/minute")
def update_social_config(
    request: Request,
    event_id: str,
    payload: schemas.SocialConfigUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    
    pipeline = event.pipeline_config or {}
    current_social = pipeline.get("social_scraping", DEFAULT_SOCIAL_CONFIG)
    
    # Update only defined fields
    updated_fields = payload.dict(exclude_unset=True)
    new_social = {**current_social, **updated_fields}
    
    pipeline["social_scraping"] = new_social
    event.pipeline_config = pipeline
    flag_modified(event, "pipeline_config")
    db.commit()
    return new_social


@router.get("/auth-status")
@limiter.limit("20/minute")
def get_auth_status(request: Request, event_id: str, _: models.User = Depends(require_committee)):
    # Check configurations for each platform
    from ..social_service import check_platform_auth
    return {
        "twitter": check_platform_auth("twitter"),
        "linkedin": check_platform_auth("linkedin"),
        "instagram": check_platform_auth("instagram"),
        "mock": check_platform_auth("mock")
    }


# ── Participant Endpoints ──────────────────────────────────────────────────────

@router.get("/teams/{team_id}/social-posts")
@limiter.limit("60/minute")
def get_team_social_posts(
    request: Request,
    event_id: str,
    team_id: str,
    db: Session = Depends(get_db)
):
    check_social_scraping_allowed(event_id, db)
    posts = db.query(SocialPost).filter(
        SocialPost.team_id == team_id,
        SocialPost.event_id == event_id
    ).order_by(SocialPost.created_at.desc()).all()
    return posts


# ── Vision Engagement Extractors (Gemini primary, Groq fallback) ──────────────

GEMINI_VISION_MODEL = "gemini-2.5-flash"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_API_BASE = "https://api.groq.com/openai/v1"

async def _gemini_vision_extract(
    image_b64: str,
    mime: str,
    post_url: str = None,
    expected_token: str = None,
    event_hashtag: str = None
) -> tuple[int, int, bool]:
    """Gemini Vision: verify URL match + extract likes/reposts.
    Raises RuntimeError on any failure so callers can fall back to Groq.
    """
    import httpx, json as _json
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        raise RuntimeError("No GEMINI_API_KEY configured")

    if post_url:
        text_prompt = (
            f"This screenshot was submitted as proof for a social media post. "
            f"The claimed post URL is: {post_url}\n"
        )
        if expected_token and event_hashtag:
            text_prompt += (
                f"The post MUST contain the verification code '{expected_token}' "
                f"and the event hashtag '{event_hashtag}' (case-insensitive) somewhere in the post text visible in the screenshot.\n"
            )
        text_prompt += (
            "\nPlease do two things:\n"
            "1. Verify: Does this screenshot appear to show the post from that URL? "
            "Check if the username, post content, or any visible URL/profile in the screenshot "
            "is consistent with the claimed URL. It is okay if the exact URL is not visible — "
            "just check whether the post content and account seem consistent with the domain and path in the URL. "
        )
        if expected_token and event_hashtag:
            text_prompt += (
                f"Additionally, verify that BOTH the verification code '{expected_token}' and "
                f"the event hashtag '{event_hashtag}' (case-insensitive) are clearly visible "
                f"in the text of the post in the screenshot. If either is missing or incorrect, answer false for url_matches.\n"
            )
        text_prompt += (
            "Answer true or false for url_matches.\n"
            "2. Extract: What are the exact likes count and reposts/retweets/shares count visible in this screenshot?\n"
            "3. Extract tags: Find and extract any verification code (in the format 'EC-XXXXXXXX') and hashtags present in the post text.\n\n"
            "Reply with ONLY a JSON object, no markdown, no explanation:\n"
            '{\n'
            '  "url_matches": true/false,\n'
            '  "likes": <integer>,\n'
            '  "reposts": <integer>,\n'
            '  "found_verification_code": "<extracted EC-XXXXXXXX code or empty string>",\n'
            '  "found_hashtag": "<extracted hashtags or empty string>"\n'
            '}\n'
            "Set url_matches to false if the screenshot clearly does NOT match the claimed URL, "
            "or does not contain the required verification code or hashtag. "
            "Use 0 for any count you cannot find."
        )
    else:
        text_prompt = (
            "This is a social media post screenshot. "
            "Find the exact likes count and reposts/retweets/shares count from the engagement stats. "
            "Reply with ONLY a JSON object, no markdown, no explanation: "
            '{\"url_matches\": true, \"likes\": <integer>, \"reposts\": <integer>}. '
            "Use 0 for any number you cannot find."
        )

    # All vision-capable text-out models from Google AI Studio — newest-first.
    # Automatically falls through to next model on 429 / rate-limit errors.
    gemini_models = [
        "gemini-3.5-flash",       # Gemini 3.5 Flash
        "gemini-3.1-flash-lite",  # Gemini 3.1 Flash Lite
        "gemini-3.0-flash",       # Gemini 3 Flash
        "gemini-2.5-pro",         # Gemini 2.5 Pro
        "gemini-2.5-flash",       # Gemini 2.5 Flash
        "gemini-2.5-flash-lite",  # Gemini 2.5 Flash Lite
        "gemini-2.0-flash",       # Gemini 2 Flash
        "gemini-2.0-flash-lite",  # Gemini 2 Flash Lite
    ]
    last_err = None
    for model_name in gemini_models:
        api_url = f"{GEMINI_API_BASE}/{model_name}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [
                {"text": text_prompt},
                {"inline_data": {"mime_type": mime, "data": image_b64}}
            ]}],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 200,
                "thinkingConfig": {"thinkingBudget": 0}
            }
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(api_url, json=payload)
                if res.status_code != 200:
                    raise RuntimeError(f"API error {res.status_code}: {res.text[:200]}")
                data = res.json()
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                text = next((p.get("text", "") for p in parts if "text" in p), "").strip()
                json_match = re.search(r'\{[^}]+\}', text)
                if not json_match:
                    raise RuntimeError(f"Returned unparseable response: {text[:100]}")
                parsed = _json.loads(json_match.group(0))
                likes = int(parsed.get("likes", 0))
                reposts = int(parsed.get("reposts", 0))
                url_matches = bool(parsed.get("url_matches", True))

                # Strict verification check
                if expected_token:
                    found_token = parsed.get("found_verification_code", "").strip().upper()
                    expected_clean = expected_token.replace("-", "").upper()
                    found_clean = found_token.replace("-", "").upper()
                    if expected_clean not in found_clean:
                        print(f"[Vision Verification/Gemini] Strict Token Mismatch! Expected: {expected_token}, Found: {found_token}")
                        url_matches = False

                if event_hashtag:
                    found_hashtag = parsed.get("found_hashtag", "").strip().lower()
                    expected_clean = event_hashtag.replace("#", "").lower()
                    found_clean = found_hashtag.replace("#", "").lower()
                    if expected_clean not in found_clean:
                        print(f"[Vision Verification/Gemini] Strict Hashtag Mismatch! Expected: {event_hashtag}, Found: {found_hashtag}")
                        url_matches = False

                print(f"[Vision OCR] Model {model_name} succeeded!")
                return likes, reposts, url_matches
        except Exception as err:
            print(f"[Vision OCR] Model {model_name} failed: {err}")
            last_err = err
            continue

    raise RuntimeError(f"All Gemini models failed. Last error: {last_err}")


async def _groq_vision_extract(
    image_b64: str,
    mime: str,
    post_url: str = None,
    expected_token: str = None,
    event_hashtag: str = None
) -> tuple[int, int, bool]:
    """Groq vision fallback using llama-4-scout (OpenAI-compatible API with vision).
    Raises RuntimeError on any failure.
    """
    import httpx, json as _json
    key = (settings.GROQ_API_KEY or "").strip()
    if not key:
        raise RuntimeError("No GROQ_API_KEY configured")

    if post_url:
        text_prompt = (
            f"This screenshot was submitted as proof for a social media post. "
            f"The claimed post URL is: {post_url}\n"
        )
        if expected_token and event_hashtag:
            text_prompt += (
                f"The post MUST contain the verification code '{expected_token}' "
                f"and the event hashtag '{event_hashtag}' (case-insensitive) somewhere in the post text visible in the screenshot.\n"
            )
        text_prompt += (
            "\nPlease do two things:\n"
            "1. Verify: Does this screenshot appear to show the post from that URL, and does it contain the required verification code and hashtag? "
            "Check if the username/account and content match the URL domain and path. "
        )
        if expected_token and event_hashtag:
            text_prompt += (
                f"Verify that both the verification code '{expected_token}' and "
                f"the event hashtag '{event_hashtag}' (case-insensitive) are clearly visible in the text of the post in the screenshot. "
                "If either is missing, answer false for url_matches.\n"
            )
        text_prompt += (
            "2. What are the likes count and reposts/shares count visible in this screenshot?\n"
            "3. Extract tags: Find and extract any verification code (in the format 'EC-XXXXXXXX') and hashtags present in the post text.\n\n"
            "Reply with ONLY a JSON object (no markdown):\n"
            '{\n'
            '  "url_matches": true/false,\n'
            '  "likes": <integer>,\n'
            '  "reposts": <integer>,\n'
            '  "found_verification_code": "<extracted EC-XXXXXXXX code or empty string>",\n'
            '  "found_hashtag": "<extracted hashtags or empty string>"\n'
            '}\n'
            "Set url_matches to false if the screenshot clearly does NOT match, or does not contain the required code or hashtag. "
            "Use 0 for any count you cannot find."
        )
    else:
        text_prompt = (
            "This is a social media post screenshot. "
            "Find the exact likes count and reposts/shares count from the engagement stats. "
            'Reply ONLY with JSON (no markdown): {\"url_matches\": true, \"likes\": <integer>, \"reposts\": <integer>}. '
            "Use 0 for any count you cannot find."
        )

    payload = {
        "model": GROQ_VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": text_prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}}
            ]
        }],
        "temperature": 0,
        "max_tokens": 200
    }
    api_url = f"{GROQ_API_BASE}/chat/completions"
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            api_url, json=payload,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        )
        if res.status_code != 200:
            raise RuntimeError(f"Groq Vision API error {res.status_code}: {res.text[:200]}")
        data = res.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        json_match = re.search(r'\{[^}]+\}', text)
        if not json_match:
            raise RuntimeError(f"Groq Vision returned unparseable response: {text[:100]}")
        parsed = _json.loads(json_match.group(0))
        likes = int(parsed.get("likes", 0))
        reposts = int(parsed.get("reposts", 0))
        url_matches = bool(parsed.get("url_matches", True))

        # Strict verification check
        if expected_token:
            found_token = parsed.get("found_verification_code", "").strip().upper()
            expected_clean = expected_token.replace("-", "").upper()
            found_clean = found_token.replace("-", "").upper()
            if expected_clean not in found_clean:
                print(f"[Vision Verification/Groq] Strict Token Mismatch! Expected: {expected_token}, Found: {found_token}")
                url_matches = False

        if event_hashtag:
            found_hashtag = parsed.get("found_hashtag", "").strip().lower()
            expected_clean = event_hashtag.replace("#", "").lower()
            found_clean = found_hashtag.replace("#", "").lower()
            if expected_clean not in found_clean:
                print(f"[Vision Verification/Groq] Strict Hashtag Mismatch! Expected: {event_hashtag}, Found: {found_hashtag}")
                url_matches = False

        return likes, reposts, url_matches


async def _extract_metrics_from_screenshot(
    screenshot_url: str,
    post_url: str = None,
    expected_token: str = None,
    event_hashtag: str = None
) -> tuple[int, int, bool]:
    """
    Download a screenshot and run it through vision AI to:
      1. Verify the screenshot matches the claimed `post_url` (when provided)
      2. Verify the screenshot displays the team's verification code and event hashtag
      3. Extract likes and reposts counts from the image.

    Provider chain: Gemini Vision → Groq Vision (llama-4-scout) → safe defaults.
    Returns (likes, reposts, url_matches).
    """
    import httpx, base64 as _b64
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            img_res = await client.get(screenshot_url)
            if img_res.status_code != 200:
                print(f"[Vision OCR] Could not download image: {img_res.status_code}")
                return 0, 0, True  # Can't download: skip check
            img_b64 = _b64.b64encode(img_res.content).decode("utf-8")

        mime = "image/jpeg"
        url_lower = screenshot_url.lower()
        if url_lower.endswith(".png"):
            mime = "image/png"
        elif url_lower.endswith(".webp"):
            mime = "image/webp"
        elif url_lower.endswith(".gif"):
            mime = "image/gif"

        # ── 1. Try Gemini Vision ───────────────────────────────────────────
        try:
            likes, reposts, url_matches = await _gemini_vision_extract(img_b64, mime, post_url, expected_token, event_hashtag)
            print(f"[Vision OCR/Gemini] url={post_url} → likes={likes}, reposts={reposts}, url_matches={url_matches}")
            return likes, reposts, url_matches
        except Exception as gemini_err:
            print(f"[Vision OCR] Gemini failed: {gemini_err}. Trying Groq fallback...")

        # ── 2. Groq Vision fallback ────────────────────────────────────────
        try:
            likes, reposts, url_matches = await _groq_vision_extract(img_b64, mime, post_url, expected_token, event_hashtag)
            print(f"[Vision OCR/Groq] url={post_url} → likes={likes}, reposts={reposts}, url_matches={url_matches}")
            return likes, reposts, url_matches
        except Exception as groq_err:
            print(f"[Vision OCR] Groq fallback also failed: {groq_err}.")
            raise RuntimeError(f"Groq fallback failed: {groq_err}")

    except Exception as e:
        print(f"[Vision OCR] Unexpected error for {screenshot_url}: {e}")
        raise RuntimeError(f"Vision OCR failed: {e}")



async def run_immediate_scrape(event_id: str):
    db = SessionLocal()
    try:
        await scrape_pending_posts(event_id, db)
    finally:
        db.close()


@router.post("/teams/{team_id}/social-posts")
@limiter.limit("10/minute")
async def submit_social_post(
    request: Request,
    event_id: str,
    team_id: str,
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    screenshot_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    check_social_scraping_allowed(event_id, db)
    
    # 1. Detect Platform
    url_lower = url.lower()
    if "twitter.com" in url_lower or "x.com" in url_lower:
        platform = "twitter"
    elif "linkedin.com" in url_lower:
        platform = "linkedin"
    elif "instagram.com" in url_lower:
        platform = "instagram"
    else:
        raise HTTPException(400, "Unsupported social media URL. Supported platforms: Twitter/X, LinkedIn, Instagram.")

    # 2. Duplicate Check
    duplicate = db.query(SocialPost).filter(
        SocialPost.event_id == event_id,
        SocialPost.url == url
    ).first()
    if duplicate:
        if duplicate.team_id != team_id:
            raise HTTPException(400, "This post URL has already been submitted by another team.")
        
        # Status-gated check
        if duplicate.status in ["verified", "pending_review"]:
            # If the post is verified but has no screenshot, and they are now uploading a screenshot, allow it!
            if duplicate.status == "verified" and not duplicate.screenshot_url and screenshot_file:
                pass
            else:
                raise HTTPException(400, f"This URL has already been submitted and is currently {duplicate.status.replace('_', ' ')}. You cannot modify or resubmit it.")
        
        # If it belongs to the same team, and they are providing a screenshot, update the existing post
        if screenshot_file:
            try:
                file_bytes = await screenshot_file.read()
                
                # Screenshot hash dedup
                import hashlib
                hasher = hashlib.sha256()
                hasher.update(file_bytes)
                file_hash = hasher.hexdigest()
                
                existing_with_hash = db.query(SocialPost).filter(
                    SocialPost.event_id == event_id,
                    SocialPost.screenshot_hash == file_hash,
                    SocialPost.url != url
                ).first()
                if existing_with_hash:
                    raise HTTPException(400, "This screenshot has already been used for another post/URL. Please upload a unique screenshot of your post.")
                
                screenshot_url = upload_screenshot(file_bytes, screenshot_file.filename, str(request.base_url))
                duplicate.screenshot_url = screenshot_url
                duplicate.screenshot_hash = file_hash
                duplicate.status = "pending_review"
                
                db.commit()
                db.refresh(duplicate)
                
                background_tasks.add_task(run_immediate_scrape, event_id)
                
                await broadcast(event_id, {
                    "type": "social:post_updated",
                    "post_id": duplicate.id,
                    "status": "pending_review",
                    "screenshot_url": screenshot_url
                })
                
                return {
                    "id": duplicate.id,
                    "platform": duplicate.platform,
                    "url": duplicate.url,
                    "status": duplicate.status,
                    "screenshot_url": duplicate.screenshot_url,
                    "created_at": duplicate.created_at
                }
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(500, f"Failed to upload screenshot: {str(e)}")
        else:
            raise HTTPException(400, "This post URL has already been submitted. Please attach a screenshot if you wish to upload proof.")

    # 3. Cap checks: Max 5 posts per team
    total_posts = db.query(SocialPost).filter(
        SocialPost.team_id == team_id,
        SocialPost.event_id == event_id
    ).count()
    if total_posts >= 5:
        raise HTTPException(400, "Maximum limit of 5 social post submissions reached for this team.")

    # 4. Cooldown checks: 30s cooldown
    last_post = db.query(SocialPost).filter(
        SocialPost.team_id == team_id,
        SocialPost.event_id == event_id
    ).order_by(SocialPost.created_at.desc()).first()
    
    if last_post:
        delta = datetime.datetime.utcnow() - last_post.created_at
        if delta.total_seconds() < 30:
            wait_time = int(30 - delta.total_seconds())
            raise HTTPException(400, f"Please wait {wait_time} seconds before submitting another link.")

    # 5. Handle Screenshot Upload
    screenshot_url = None
    file_hash = None
    status = "pending"
    if screenshot_file:
        try:
            file_bytes = await screenshot_file.read()
            
            # Screenshot hash dedup
            import hashlib
            hasher = hashlib.sha256()
            hasher.update(file_bytes)
            file_hash = hasher.hexdigest()
            
            existing_with_hash = db.query(SocialPost).filter(
                SocialPost.event_id == event_id,
                SocialPost.screenshot_hash == file_hash,
                SocialPost.url != url
            ).first()
            if existing_with_hash:
                raise HTTPException(400, "This screenshot has already been used for another post/URL. Please upload a unique screenshot of your post.")
                
            screenshot_url = upload_screenshot(file_bytes, screenshot_file.filename, str(request.base_url))
            status = "pending_review"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Failed to upload screenshot: {str(e)}")

    # 6. Save Social Post
    db_post = SocialPost(
        team_id=team_id,
        event_id=event_id,
        platform=platform,
        url=url,
        status=status,
        screenshot_url=screenshot_url,
        screenshot_hash=file_hash
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    if db_post.status in ["pending", "pending_review"]:
        background_tasks.add_task(run_immediate_scrape, event_id)

    await broadcast(event_id, {
        "type": "social:post_created",
        "team_id": team_id,
        "post_id": db_post.id
    })

    return {
        "id": db_post.id,
        "platform": db_post.platform,
        "url": db_post.url,
        "status": db_post.status,
        "screenshot_url": db_post.screenshot_url,
        "created_at": db_post.created_at
    }


@router.put("/teams/{team_id}/social-posts/{post_id}/proof")
@limiter.limit("10/minute")
async def upload_post_proof(
    request: Request,
    event_id: str,
    team_id: str,
    post_id: str,
    background_tasks: BackgroundTasks,
    screenshot_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    check_social_scraping_allowed(event_id, db)
    
    post = db.query(SocialPost).filter(
        SocialPost.id == post_id,
        SocialPost.team_id == team_id,
        SocialPost.event_id == event_id
    ).first()
    
    if not post:
        raise HTTPException(404, "Social post not found.")

    # Status-gated check
    if post.status in ["verified", "pending_review"]:
        if post.status == "verified" and not post.screenshot_url:
            pass
        else:
            raise HTTPException(400, f"This post is already {post.status.replace('_', ' ')} and proof cannot be updated.")

    try:
        file_bytes = await screenshot_file.read()
        
        # Screenshot hash dedup
        import hashlib
        hasher = hashlib.sha256()
        hasher.update(file_bytes)
        file_hash = hasher.hexdigest()
        
        existing_with_hash = db.query(SocialPost).filter(
            SocialPost.event_id == event_id,
            SocialPost.screenshot_hash == file_hash,
            SocialPost.url != post.url
        ).first()
        if existing_with_hash:
            raise HTTPException(400, "This screenshot has already been used for another post/URL. Please upload a unique screenshot of your post.")
            
        screenshot_url = upload_screenshot(file_bytes, screenshot_file.filename, str(request.base_url))
        
        post.screenshot_url = screenshot_url
        post.screenshot_hash = file_hash
        post.status = "pending_review"
        db.commit()
        db.refresh(post)
        
        background_tasks.add_task(run_immediate_scrape, event_id)

        # Broadcast via WebSockets
        await broadcast(event_id, {
            "type": "social:post_updated",
            "post_id": post.id,
            "status": "pending_review",
            "screenshot_url": screenshot_url
        })
        
        return post
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to upload screenshot: {str(e)}")


@router.delete("/teams/{team_id}/social-posts/{post_id}")
@limiter.limit("20/minute")
async def delete_social_post(
    request: Request,
    event_id: str,
    team_id: str,
    post_id: str,
    db: Session = Depends(get_db)
):
    check_social_scraping_allowed(event_id, db)
    
    post = db.query(SocialPost).filter(
        SocialPost.id == post_id,
        SocialPost.team_id == team_id,
        SocialPost.event_id == event_id
    ).first()
    
    if not post:
        raise HTTPException(404, "Social post not found.")
        
    db.delete(post)
    db.commit()
    
    await _internal_calculate_scores(event_id, db)
    
    await broadcast(event_id, {
        "type": "social:post_deleted",
        "team_id": team_id,
        "post_id": post_id
    })
    
    return {"status": "success"}


@router.get("/social-posts")
@limiter.limit("30/minute")
def get_all_social_posts(
    request: Request,
    event_id: str,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    query = db.query(SocialPost).filter(SocialPost.event_id == event_id)
    if platform:
        query = query.filter(SocialPost.platform == platform)
    if status:
        query = query.filter(SocialPost.status == status)
        
    posts = query.order_by(SocialPost.created_at.desc()).all()
    
    enriched = []
    for p in posts:
        team = db.query(Team).filter(Team.id == p.team_id).first()
        enriched.append({
            "id": p.id,
            "team_id": p.team_id,
            "team_name": team.name if team else "Unknown Team",
            "platform": p.platform,
            "url": p.url,
            "status": p.status,
            "likes": p.likes,
            "shares": p.shares,
            "screenshot_url": p.screenshot_url,
            "last_scraped_at": p.last_scraped_at,
            "created_at": p.created_at
        })
    return enriched


@router.post("/social-posts/{post_id}/verify")
@limiter.limit("30/minute")
async def verify_post_manually(
    request: Request,
    event_id: str,
    post_id: str,
    payload: PostVerifyPayload,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    
    post = db.query(SocialPost).filter(
        SocialPost.id == post_id,
        SocialPost.event_id == event_id
    ).first()
    
    if not post:
        raise HTTPException(404, "Social post not found.")

    if payload.approve:
        post.status = "verified"
        post.likes = payload.likes
        post.shares = payload.shares
    else:
        post.status = "verification_failed"

    post.last_scraped_at = datetime.datetime.utcnow()
    db.commit()
    
    # Recalculate event-wide scores
    await _internal_calculate_scores(event_id, db)
    
    await broadcast(event_id, {
        "type": "social:post_updated",
        "post_id": post.id,
        "status": post.status,
        "likes": post.likes,
        "shares": post.shares
    })
    
    return post


@router.post("/scrape-tick")
@limiter.limit("5/minute")
async def scrape_tick(
    request: Request,
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    scraped_count = await scrape_pending_posts(event_id, db)
    return {"status": "success", "scraped_count": scraped_count}


@router.post("/calculate-scores")
@limiter.limit("5/minute")
async def calculate_social_scores(
    request: Request,
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    
    background_tasks.add_task(broadcast, event_id, {
        "type": "social:pipeline_step",
        "step": "calculate",
        "platform": "mock",
        "status": "running"
    })
    
    await _internal_calculate_scores(event_id, db)
    
    background_tasks.add_task(broadcast, event_id, {
        "type": "social:pipeline_step",
        "step": "calculate",
        "platform": "mock",
        "status": "success"
    })
    
    return {"status": "success"}


# ── Pipeline / Summary Endpoints ───────────────────────────────────────────────

@router.post("/run-pipeline")
@limiter.limit("3/minute")
async def run_full_pipeline(
    request: Request,
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    # Background scrape followed by score calculation
    await scrape_tick(event_id, db)
    await calculate_social_scores(event_id, background_tasks, db, _)
    return {"status": "pipeline_started", "message": "Scrape tick and score recalculation triggered."}


@router.get("/campaign-summary")
@limiter.limit("10/minute")
def get_campaign_summary(
    request: Request,
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    posts = db.query(SocialPost).filter(SocialPost.event_id == event_id).all()
    teams = db.query(Team).filter(Team.event_id == event_id).all()
    
    if not posts:
        return {
            "total_polls": 0,
            "total_votes": 0,
            "avg_votes_per_poll": 0.0,
            "flagged_polls": 0,
            "team_scores": [
                {
                    "team_id": t.id,
                    "team_name": t.name,
                    "score": t.social_vote_score or 0.0,
                    "total_votes": t.social_vote_total_votes or 0
                }
                for t in teams
            ],
            "ai_summary": "No campaign posts submitted yet. Submit and verify team posts to generate a summary.",
            "llm_provider_used": None
        }

    # Map posts to old LLM poll format to reuse the generate_social_campaign_summary logic
    mapped_posts_for_summary = []
    for p in posts:
        mapped_posts_for_summary.append({
            "platform": p.platform,
            "question": f"URL: {p.url}",
            "status": p.status,
            "total_votes": p.likes + p.shares,
            "flagged": p.status == "verification_failed",
            "flag_reason": "failed_verification",
            "normalized_score": p.likes + p.shares,
            "votes": {"Likes": p.likes, "Shares": p.shares}
        })
        
    teams_data = [{"id": t.id, "name": t.name, "social_vote_score": t.social_vote_score, "total_votes": t.social_vote_total_votes} for t in teams]
    
    md_summary, summary_provider = generate_social_campaign_summary(mapped_posts_for_summary, teams_data)
    
    # Fetch event name for personalization
    from ..models import Event
    event_obj = db.query(Event).filter(Event.id == event_id).first()
    event_name = event_obj.name if event_obj else "Event"
    header = f"# Social Media Voting Campaign Report: {event_name}"
    full_report = header + "\n" + md_summary
    
    return {
        "total_polls": len(posts),
        "total_votes": sum([(p.likes + p.shares) for p in posts]),
        "avg_votes_per_poll": round(sum([(p.likes + p.shares) for p in posts]) / len(posts), 1) if posts else 0,
        "flagged_polls": len([p for p in posts if p.status == "verification_failed"]),
        "team_scores": [
            {
                "team_id": t.id,
                "team_name": t.name,
                "score": t.social_vote_score or 0.0,
                "total_votes": t.social_vote_total_votes or 0
            }
            for t in teams
        ],
        "ai_summary": full_report,
        "llm_provider_used": summary_provider
    }


@router.post("/reset-campaign")
@limiter.limit("3/minute")
def reset_campaign_data(
    request: Request,
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    check_social_scraping_allowed(event_id, db)
    db.query(SocialPost).filter(SocialPost.event_id == event_id).delete()
    
    teams = db.query(Team).filter(Team.event_id == event_id).all()
    for team in teams:
        team.social_vote_score = 0.0
        team.social_vote_total_votes = 0
        team.social_vote_last_updated = None
        
        # Recalculate combined scores
        from .evaluations import _recompute_combined_public
        _recompute_combined_public(team, db)
        
    db.commit()
    return {"status": "success", "message": "Social campaign data reset successfully."}


async def scrape_pending_posts(event_id: str, db: Session) -> int:
    """
    Finds all SocialPost records in 'pending' status for the event,
    crawls their public pages, checks for token and hashtag,
    and updates their status, likes, shares, and timestamps.
    """
    import httpx
    
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return 0

    pending_posts = db.query(SocialPost).filter(
        SocialPost.event_id == event_id,
        SocialPost.status.in_(["pending", "pending_review"])
    ).all()

    if not pending_posts:
        return 0

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.google.com/"
    }

    scraped_count = 0
    import random

    for post in pending_posts:
        team = db.query(Team).filter(Team.id == post.team_id).first()
        if not team:
            continue

        # Expected token: e.g. EC-349AF (based on team ID prefix)
        expected_token = f"EC-{team.id[:8].upper()}"
        event_name = event.name.lower()
        # Default hashtags
        event_hashtag = "#" + "".join(e for e in event.name if e.isalnum())

        # ── pending_review: Screenshot already uploaded, skip token check ──
        # Gemini Vision reads the screenshot to get real engagement numbers.
        if post.status == "pending_review":
            try:
                likes = 0
                reposts = 0
                url_matches = True

                # Gemini Vision OCR on the screenshot — also verifies URL match, code, and hashtag
                if post.screenshot_url:
                    likes, reposts, url_matches = await _extract_metrics_from_screenshot(
                        post.screenshot_url,
                        post.url,
                        expected_token=expected_token,
                        event_hashtag=event_hashtag
                    )
                    print(f"[Screenshot OCR] post={post.id} platform={post.platform} likes={likes} reposts={reposts} url_matches={url_matches}")

                # Reject if Gemini says the screenshot doesn't match the claimed URL
                if not url_matches:
                    post.status = "verification_failed"
                    post.last_scraped_at = datetime.datetime.utcnow()
                    db.commit()
                    print(f"[Screenshot OCR] URL mismatch — post={post.id} rejected")
                    await broadcast(event_id, {
                        "type": "social:post_updated",
                        "post_id": post.id,
                        "status": "verification_failed"
                    })
                    continue

                post.likes = likes
                post.shares = reposts
                post.status = "verified"
                post.last_scraped_at = datetime.datetime.utcnow()
                db.commit()
                scraped_count += 1

                await broadcast(event_id, {
                    "type": "social:post_updated",
                    "post_id": post.id,
                    "status": "verified",
                    "likes": likes,
                    "shares": reposts
                })
            except Exception as e:
                print(f"Error processing screenshot post {post.id}: {str(e)}")
            continue  # Move to next post

        # ── pending: Auto-verify via URL scrape (token + hashtag check) ──
        # Engagement: Gemini Vision on any attached screenshot.
        # If no screenshot, engagement stays at 0 (we cannot scrape platform walls).
        try:
            status_code = 200
            html_content = ""

            async with httpx.AsyncClient(headers=headers, timeout=10.0, follow_redirects=True) as client:
                try:
                    res = await client.get(post.url)
                    status_code = res.status_code
                    if status_code == 200:
                        html_content = res.text
                except Exception:
                    status_code = 0

            if status_code == 200:
                # ── Verification Check ────────────────────────────────────
                has_token = expected_token.lower() in html_content.lower()
                has_event = (event_name in html_content.lower()) or (event_hashtag.lower() in html_content.lower())

                if not has_token or not has_event:
                    post.status = "verification_failed"
                    post.last_scraped_at = datetime.datetime.utcnow()
                    db.commit()
                    await broadcast(event_id, {
                        "type": "social:post_updated",
                        "post_id": post.id,
                        "status": "verification_failed"
                    })
                    continue

            # ── Extract engagement from screenshot via Gemini Vision ───────────
            # Platform walls block HTML scraping, so screenshot is the only real source.
            # Gemini also verifies the screenshot matches the submitted URL.
            likes = 0
            reposts = 0
            if post.screenshot_url:
                likes, reposts, url_matches = await _extract_metrics_from_screenshot(
                    post.screenshot_url,
                    post.url,
                    expected_token=expected_token,
                    event_hashtag=event_hashtag
                )
                print(f"[Gemini Vision URL post] post={post.id} platform={post.platform} likes={likes} reposts={reposts} url_matches={url_matches}")
                if not url_matches:
                    post.status = "verification_failed"
                    post.last_scraped_at = datetime.datetime.utcnow()
                    db.commit()
                    print(f"[Gemini Vision URL post] URL mismatch — post={post.id} rejected")
                    await broadcast(event_id, {
                        "type": "social:post_updated",
                        "post_id": post.id,
                        "status": "verification_failed"
                    })
                    continue

            post.likes = likes
            post.shares = reposts
            post.status = "verified"
            post.last_scraped_at = datetime.datetime.utcnow()
            db.commit()
            scraped_count += 1

            await broadcast(event_id, {
                "type": "social:post_updated",
                "post_id": post.id,
                "status": "verified",
                "likes": likes,
                "shares": reposts
            })
        except Exception as e:
            print(f"Error scraping post {post.id}: {str(e)}")
            post.status = "fetch_error"
            post.last_scraped_at = datetime.datetime.utcnow()
            db.commit()
            
            await broadcast(event_id, {
                "type": "social:post_updated",
                "post_id": post.id,
                "status": "fetch_error"
            })
            
    if scraped_count > 0:
        await _internal_calculate_scores(event_id, db)
        
    return scraped_count


async def _internal_calculate_scores(event_id: str, db: Session):
    from ..models import Team, SocialPost
    from .evaluations import _recompute_combined_public

    teams = db.query(Team).filter(Team.event_id == event_id).all()
    if not teams:
        return

    # Calculate raw engagement for each team
    # Formula: Raw = Likes + Shares * 2.5
    team_raws = {}
    for team in teams:
        verified_posts = db.query(SocialPost).filter(
            SocialPost.team_id == team.id,
            SocialPost.status == "verified"
        ).all()
        
        raw_score = sum(post.likes + (post.shares * 2.5) for post in verified_posts)
        # Cap raw score to prevent bot abuse
        team_raws[team.id] = min(1000.0, raw_score)

    max_raw = max(team_raws.values()) if team_raws else 0.0

    for team in teams:
        raw = team_raws.get(team.id, 0.0)
        if max_raw > 0:
            normalized = round((raw / max_raw) * 10.0, 2)
        else:
            normalized = 0.0
            
        team.social_vote_score = normalized
        team.social_vote_total_votes = int(db.query(SocialPost).filter(
            SocialPost.team_id == team.id,
            SocialPost.status == "verified"
        ).count())
        
        team.social_vote_last_updated = datetime.datetime.utcnow()
        _recompute_combined_public(team, db)
        db.commit()
