import asyncio
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..database import get_db
from ..auth import require_committee
from .. import models, schemas
from ..models import Event, Team, SocialPoll, SocialPollStatus
from ..social_service import get_platform, check_platform_auth, PlatformAPIError, RateLimitError
from ..llm import (
    generate_poll_content,
    normalize_poll_votes,
    aggregate_cross_platform_scores,
    generate_social_campaign_summary
)
from ..config import settings
from ..ws import broadcast

router = APIRouter(prefix="/api/events/{event_id}/social-scraping", tags=["social-scraping"])

DEFAULT_SOCIAL_CONFIG = {
    "enabled": False,
    "platforms": [],
    "poll_type": "hybrid",
    "poll_duration_minutes": 1440,
    "auto_post_on_evaluation": False,
    "auto_fetch_on_completion": True,
    "min_vote_threshold": 30
}

@router.get("/config")
def get_social_config(event_id: str, db: Session = Depends(get_db), _: models.User = Depends(require_committee)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    config = (event.pipeline_config or {}).get("social_scraping", DEFAULT_SOCIAL_CONFIG)
    return config

@router.put("/config")
def update_social_config(
    event_id: str,
    payload: schemas.SocialConfigUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
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
def get_auth_status(event_id: str, _: models.User = Depends(require_committee)):
    # Check configurations for each platform
    return {
        "twitter": check_platform_auth("twitter"),
        "linkedin": check_platform_auth("linkedin"),
        "instagram": check_platform_auth("instagram"),
        "mock": check_platform_auth("mock")
    }

@router.post("/generate-polls")
async def generate_draft_polls(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    
    config = (event.pipeline_config or {}).get("social_scraping", DEFAULT_SOCIAL_CONFIG)
    if not config.get("enabled"):
        raise HTTPException(400, "Social scraping is not enabled for this event.")
        
    platforms = config.get("platforms", [])
    if not platforms:
        raise HTTPException(400, "No social platforms are selected in the configuration.")

    teams = db.query(Team).filter(Team.event_id == event_id).all()
    if not teams:
        raise HTTPException(400, "No teams available to generate polls for.")

    # Determine poll type (hybrid auto-decides)
    configured_type = config.get("poll_type", "hybrid")
    poll_type = configured_type
    if configured_type == "hybrid":
        poll_type = "comparative" if len(teams) <= 4 else "rating"

    # Delete existing draft polls
    db.query(SocialPoll).filter(
        SocialPoll.event_id == event_id,
        SocialPoll.status == SocialPollStatus.draft
    ).delete()
    db.commit()

    created_polls = []
    
    # Batch LLM generation for each platform
    for idx, platform in enumerate(platforms):
        if idx > 0:
            await asyncio.sleep(2.0)

        # Notify start of step via WS
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "generate",
            "platform": platform,
            "status": "running"
        })
        
        try:
            teams_data = [{"id": t.id, "name": t.name, "challenge": t.challenge or ""} for t in teams]
            llm_result = generate_poll_content(
                teams=teams_data,
                platform=platform,
                poll_type=poll_type,
                event_name=event.name
            )
            
            provider_used = llm_result.get("llm_provider_used")
            polls_list = llm_result.get("polls", [])
            for poll_data in polls_list:
                db_poll = SocialPoll(
                    event_id=event_id,
                    team_id=poll_data.get("team_id"),
                    platform=platform,
                    poll_type=poll_type,
                    question_text=poll_data["question_text"],
                    commentary=poll_data.get("commentary"),
                    options=poll_data["options"],
                    option_team_mapping=poll_data.get("option_team_mapping"),
                    status=SocialPollStatus.draft,
                    duration_minutes=config.get("poll_duration_minutes", 1440),
                    llm_provider_used=provider_used
                )
                db.add(db_poll)
                created_polls.append(db_poll)
            
            db.commit()
            
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "generate",
                "platform": platform,
                "status": "success"
            })
        except Exception as e:
            db.rollback()
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "generate",
                "platform": platform,
                "status": "failed"
            })
            raise HTTPException(500, f"Failed to generate polls for {platform}: {str(e)}")

    return created_polls

@router.get("/polls")
def list_polls(
    event_id: str,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    flagged: Optional[bool] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    query = db.query(SocialPoll).filter(SocialPoll.event_id == event_id)
    if platform:
        query = query.filter(SocialPoll.platform == platform)
    if status:
        query = query.filter(SocialPoll.status == status)
    if flagged is not None:
        query = query.filter(SocialPoll.flagged == flagged)
    return query.all()

@router.get("/polls/{poll_id}")
def get_poll_detail(event_id: str, poll_id: str, db: Session = Depends(get_db), _: models.User = Depends(require_committee)):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    return poll

@router.post("/polls/{poll_id}/post")
async def post_single_poll(
    event_id: str,
    poll_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.status != SocialPollStatus.draft:
        raise HTTPException(400, "Only draft polls can be posted.")

    # WS: posting running
    background_tasks.add_task(broadcast, event_id, {
        "type": "social:pipeline_step",
        "step": "post",
        "platform": poll.platform,
        "poll_id": poll.id,
        "status": "running"
    })

    if poll.platform == "instagram":
        # Instagram cannot post automatically, wait for Story ID URN confirm
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "post",
            "platform": "instagram",
            "poll_id": poll.id,
            "status": "manual_pending"
        })
        return {"status": "manual_pending", "message": "Instagram draft ready. Manual posting required."}

    try:
        platform = get_platform(poll.platform)
        post_id = await platform.create_poll(poll)
        
        poll.platform_post_id = post_id
        poll.status = SocialPollStatus.posted
        poll.posted_at = datetime.datetime.utcnow()
        poll.ends_at = poll.posted_at + datetime.timedelta(minutes=poll.duration_minutes)
        poll.locked_at = datetime.datetime.utcnow()
        
        if poll.platform == "linkedin" and poll.poll_type == "linkedin_text_fallback":
            db.add(models.ActivityLog(
                event_id=event_id,
                message="LinkedIn: Native poll failed (403/401). Fell back to text post share with manual voting fallback.",
                log_type="warning"
            ))
        
        db.commit()
        
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:poll_posted",
            "poll_id": poll.id,
            "platform": poll.platform,
            "team_id": poll.team_id,
            "status": "success"
        })
        
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "post",
            "platform": poll.platform,
            "poll_id": poll.id,
            "status": "success"
        })
        return poll
    except (PlatformAPIError, RateLimitError) as e:
        poll.status = SocialPollStatus.failed
        poll.error_message = str(e)
        db.commit()
        
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:poll_posted",
            "poll_id": poll.id,
            "platform": poll.platform,
            "status": "failed",
            "error": str(e)
        })
        
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "post",
            "platform": poll.platform,
            "poll_id": poll.id,
            "status": "failed"
        })
        raise HTTPException(500, str(e))

@router.post("/post-all")
async def post_all_polls(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    drafts = db.query(SocialPoll).filter(
        SocialPoll.event_id == event_id,
        SocialPoll.status == SocialPollStatus.draft
    ).all()

    posted, failed, manual = 0, 0, 0
    for poll in drafts:
        if poll.platform == "instagram":
            # Instagram remains in draft status for manual posting
            manual += 1
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "post",
                "platform": "instagram",
                "poll_id": poll.id,
                "status": "manual_pending"
            })
            continue

        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "post",
            "platform": poll.platform,
            "poll_id": poll.id,
            "status": "running"
        })

        try:
            platform = get_platform(poll.platform)
            post_id = await platform.create_poll(poll)
            
            poll.platform_post_id = post_id
            poll.status = SocialPollStatus.posted
            poll.posted_at = datetime.datetime.utcnow()
            poll.ends_at = poll.posted_at + datetime.timedelta(minutes=poll.duration_minutes)
            poll.locked_at = datetime.datetime.utcnow()
            posted += 1
            
            if poll.platform == "linkedin" and poll.poll_type == "linkedin_text_fallback":
                db.add(models.ActivityLog(
                    event_id=event_id,
                    message="LinkedIn: Native poll failed (403/401). Fell back to text post share with manual voting fallback.",
                    log_type="warning"
                ))
            
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:poll_posted",
                "poll_id": poll.id,
                "platform": poll.platform,
                "team_id": poll.team_id,
                "status": "success"
            })
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "post",
                "platform": poll.platform,
                "poll_id": poll.id,
                "status": "success"
            })
        except Exception as e:
            poll.status = SocialPollStatus.failed
            poll.error_message = str(e)
            failed += 1
            
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:poll_posted",
                "poll_id": poll.id,
                "platform": poll.platform,
                "status": "failed",
                "error": str(e)
            })
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "post",
                "platform": poll.platform,
                "poll_id": poll.id,
                "status": "failed"
            })
            
        db.commit()
        # Free-tier post safety pacing delay
        await asyncio.sleep(settings.SOCIAL_POST_DELAY_SECONDS)

    return {"posted": posted, "failed": failed, "manual": manual}

@router.patch("/polls/{poll_id}/set-instagram-id")
def set_instagram_story_id(
    event_id: str,
    poll_id: str,
    payload: schemas.InstagramIdPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.platform != "instagram":
        raise HTTPException(400, "This endpoint is only for Instagram polls")
        
    poll.platform_post_id = payload.story_media_id
    poll.status = SocialPollStatus.posted
    poll.posted_at = payload.posted_at or datetime.datetime.utcnow()
    poll.ends_at = poll.posted_at + datetime.timedelta(hours=24)
    poll.locked_at = datetime.datetime.utcnow()
    db.commit()

    background_tasks.add_task(broadcast, event_id, {
        "type": "social:poll_posted",
        "poll_id": poll.id,
        "platform": "instagram",
        "status": "success"
    })
    return poll

@router.post("/polls/{poll_id}/set-post-id")
def set_poll_post_id(
    event_id: str,
    poll_id: str,
    payload: schemas.SetPostIdPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
        
    poll.platform_post_id = payload.post_id
    poll.status = SocialPollStatus.posted
    poll.posted_at = payload.posted_at or datetime.datetime.utcnow()
    poll.ends_at = poll.posted_at + datetime.timedelta(minutes=poll.duration_minutes)
    poll.locked_at = datetime.datetime.utcnow()
    if poll.error_message:
        poll.error_message = None
    db.commit()

    background_tasks.add_task(broadcast, event_id, {
        "type": "social:poll_posted",
        "poll_id": poll.id,
        "platform": poll.platform,
        "status": "success"
    })
    return poll

@router.post("/polls/{poll_id}/manual-results")
def submit_manual_votes(
    event_id: str,
    poll_id: str,
    payload: schemas.ManualVotesPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")

    poll.votes = payload.votes
    poll.total_votes = sum(payload.votes.values())
    poll.status = SocialPollStatus.completed
    poll.manual_pending = False
    poll.fetched_at = datetime.datetime.utcnow()
    
    # Anomaly validations
    if poll.total_votes < settings.SOCIAL_MIN_VOTE_THRESHOLD:
        poll.flagged = True
        poll.flag_reason = "low_votes"
    else:
        # Clear low votes flag if it was previously flagged for that
        if poll.flagged and poll.flag_reason == "low_votes":
            poll.flagged = False
            poll.flag_reason = None

    db.commit()

    background_tasks.add_task(broadcast, event_id, {
        "type": "social:poll_fetched",
        "poll_id": poll.id,
        "platform": poll.platform,
        "total_votes": poll.total_votes,
        "flagged": poll.flagged,
        "flag_reason": poll.flag_reason,
        "manual_pending": False
    })
    return poll

@router.post("/polls/{poll_id}/override-score")
def override_poll_score(
    event_id: str,
    poll_id: str,
    score: Optional[float] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
        
    poll.admin_override_score = score
    if score is not None:
        poll.flagged = True
        poll.flag_reason = "manual"
    db.commit()
    return poll

@router.post("/fetch-results")
async def fetch_polls_results(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    # Retrieve all posted polls
    ended_polls = db.query(SocialPoll).filter(
        SocialPoll.event_id == event_id,
        SocialPoll.status == SocialPollStatus.posted
    ).all()

    fetched = 0
    flagged_pending = 0
    errors = []
    
    for poll in ended_polls:
        background_tasks.add_task(broadcast, event_id, {
            "type": "social:pipeline_step",
            "step": "fetch",
            "platform": poll.platform,
            "poll_id": poll.id,
            "status": "running"
        })

        try:
            platform = get_platform(poll.platform)
            results = await platform.fetch_results(poll.platform_post_id or "")
            
            poll.votes = results["votes"]
            poll.total_votes = sum(results["votes"].values())
            poll.vote_snapshots = results.get("snapshots", [])
            poll.status = SocialPollStatus.completed
            poll.fetched_at = datetime.datetime.utcnow()
            
            if poll.total_votes < settings.SOCIAL_MIN_VOTE_THRESHOLD:
                poll.flagged = True
                poll.flag_reason = "low_votes"

            # Check velocity anomaly
            if poll.vote_snapshots and len(poll.vote_snapshots) > 1:
                for i in range(1, len(poll.vote_snapshots)):
                    prev = sum(poll.vote_snapshots[i-1]["votes"].values())
                    curr = sum(poll.vote_snapshots[i]["votes"].values())
                    if poll.total_votes > 0 and (curr - prev) / poll.total_votes > 0.4:
                        poll.flagged = True
                        poll.flag_reason = "velocity_spike"
                        break
            
            db.commit()
            fetched += 1
            
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:poll_fetched",
                "poll_id": poll.id,
                "platform": poll.platform,
                "total_votes": poll.total_votes,
                "flagged": poll.flagged,
                "flag_reason": poll.flag_reason,
                "manual_pending": False
            })
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "fetch",
                "platform": poll.platform,
                "poll_id": poll.id,
                "status": "success"
            })
        except PlatformAPIError as e:
            poll.manual_pending = True
            db.commit()
            flagged_pending += 1
            errors.append({
                "poll_id": poll.id,
                "platform": poll.platform,
                "error": str(e)
            })
            
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:poll_fetched",
                "poll_id": poll.id,
                "platform": poll.platform,
                "manual_pending": True,
                "error": str(e)
            })
            background_tasks.add_task(broadcast, event_id, {
                "type": "social:pipeline_step",
                "step": "fetch",
                "platform": poll.platform,
                "poll_id": poll.id,
                "status": "manual_pending"
            })
            
    return {"fetched": fetched, "manual_pending": flagged_pending, "errors": errors}

@router.post("/calculate-scores")
async def calculate_social_scores(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    # Run score calculation
    polls = db.query(SocialPoll).filter(
        SocialPoll.event_id == event_id,
        SocialPoll.status == SocialPollStatus.completed
    ).all()
    
    if not polls:
        raise HTTPException(400, "No completed polls available to score.")

    teams = db.query(Team).filter(Team.event_id == event_id).all()
    teams_updated = 0

    background_tasks.add_task(broadcast, event_id, {
        "type": "social:pipeline_step",
        "step": "calculate",
        "platform": "mock", # placeholder platform name for step
        "status": "running"
    })

    # To stay under the LLM free-tier rate limits, pace calls with an explicit delay wrapper
    # First, calculate normalized score for each poll using the LLM normalization helper
    for poll in polls:
        # Always recalculate normalized score to update any stale placeholder/fallback values
        opts_data = [{"text": opt["text"], "position": opt["position"]} for opt in poll.options]
        
        try:
            norm_res = normalize_poll_votes(
                votes=poll.votes,
                options=opts_data,
                poll_type=poll.poll_type,
                velocity_data=poll.vote_snapshots
            )
            poll.normalized_score = norm_res.get("normalized_score", 5.0)
            db.commit()
        except Exception as e:
            poll.normalized_score = 5.0
            db.commit()

        # Pacing delay to avoid rate limiting
        await asyncio.sleep(4.0)

    # Next, aggregate cross-platform scores for each team
    for team in teams:
        team_polls = [p for p in polls if (
            p.team_id == team.id or 
            (p.poll_type in ("comparative", "twitter_text_fallback", "linkedin_text_fallback") and p.option_team_mapping and any(t_id == team.id for t_id in p.option_team_mapping.values()))
        )]
        
        if not team_polls:
            continue
            
        polls_data = []
        for p in team_polls:
            # Map vote count for this team
            vote_count = 0
            if p.poll_type in ("comparative", "twitter_text_fallback", "linkedin_text_fallback") and p.option_team_mapping:
                # Find which position maps to this team ID
                position_key = next((k for k, v in p.option_team_mapping.items() if v == team.id), None)
                if position_key:
                    position = int(position_key.split("_")[1])
                    opt = next((o for o in p.options if o["position"] == position), None)
                    if opt:
                        vote_count = p.votes.get(opt["text"], 0)
            else:
                vote_count = p.total_votes

            base_score = p.admin_override_score if p.admin_override_score is not None else p.normalized_score
            if base_score is None:
                base_score = 5.0

            if p.poll_type in ("comparative", "twitter_text_fallback", "linkedin_text_fallback"):
                if p.total_votes > 0:
                    team_norm_score = base_score * (vote_count / p.total_votes)
                else:
                    team_norm_score = 0.0
            else:
                team_norm_score = base_score

            polls_data.append({
                "platform": p.platform,
                "normalized_score": team_norm_score,
                "flagged": p.flagged,
                "total_votes": p.total_votes,
                "team_votes": vote_count,
                "admin_override_score": p.admin_override_score
            })

        try:
            agg_res = aggregate_cross_platform_scores(polls_data)
            team.social_vote_score = agg_res.get("aggregate_score", 0.0)
            team.social_vote_total_votes = sum([p["team_votes"] for p in polls_data])
            team.social_vote_last_updated = datetime.datetime.utcnow()
            from .evaluations import _recompute_combined_public
            _recompute_combined_public(team, db)
            db.commit()
            teams_updated += 1

            background_tasks.add_task(broadcast, event_id, {
                "type": "social:scores_updated",
                "team_id": team.id,
                "team_name": team.name,
                "social_vote_score": team.social_vote_score,
                "total_votes": team.social_vote_total_votes
            })
        except Exception as e:
            pass
            
        # Pacing delay
        await asyncio.sleep(4.0)

    # Re-calculate public score (combined avg social + peer review) if peer review score exists
    # Or trigger general leaderboard updates here.
    
    background_tasks.add_task(broadcast, event_id, {
        "type": "social:pipeline_step",
        "step": "calculate",
        "platform": "mock",
        "status": "success"
    })

    return {"teams_updated": teams_updated}

@router.post("/run-pipeline")
async def run_full_pipeline(
    event_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    # Run the full pipeline synchronously/sequentially
    # 1. Generate
    await generate_draft_polls(event_id, background_tasks, db, _)
    await asyncio.sleep(4.0)
    # 2. Post
    await post_all_polls(event_id, background_tasks, db, _)
    
    return {"status": "pipeline_started", "message": "Polls generated and bulk post process completed."}

@router.get("/campaign-summary")
def get_campaign_summary(event_id: str, db: Session = Depends(get_db), _: models.User = Depends(require_committee)):
    polls = db.query(SocialPoll).filter(SocialPoll.event_id == event_id).all()
    teams = db.query(Team).filter(Team.event_id == event_id).all()
    
    if not polls:
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
            "ai_summary": "No campaign polls generated yet. Generate and run the campaign pipeline first.",
            "llm_provider_used": None
        }

    polls_data = []
    for p in polls:
        polls_data.append({
            "platform": p.platform,
            "question": p.question_text,
            "status": p.status.value,
            "total_votes": p.total_votes,
            "flagged": p.flagged,
            "flag_reason": p.flag_reason,
            "normalized_score": p.normalized_score,
            "votes": p.votes
        })
        
    teams_data = [{"id": t.id, "name": t.name, "social_vote_score": t.social_vote_score, "total_votes": t.social_vote_total_votes} for t in teams]
    
    md_summary, summary_provider = generate_social_campaign_summary(polls_data, teams_data)
    
    return {
        "total_polls": len(polls),
        "total_votes": sum([p.total_votes for p in polls]),
        "avg_votes_per_poll": round(sum([p.total_votes for p in polls]) / len(polls), 1) if polls else 0,
        "flagged_polls": len([p for p in polls if p.flagged]),
        "team_scores": [
            {
                "team_id": t.id,
                "team_name": t.name,
                "score": t.social_vote_score or 0.0,
                "total_votes": t.social_vote_total_votes
            }
            for t in teams
        ],
        "ai_summary": md_summary,
        "llm_provider_used": summary_provider
    }

@router.delete("/polls/{poll_id}")
def delete_poll(event_id: str, poll_id: str, db: Session = Depends(get_db), _: models.User = Depends(require_committee)):
    poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id, SocialPoll.event_id == event_id).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.status == SocialPollStatus.posted:
        raise HTTPException(400, "Cannot delete a poll that has already been posted.")
    db.delete(poll)
    db.commit()
    return {"status": "success", "message": "Draft poll deleted successfully."}

@router.post("/reset-campaign")
def reset_campaign_data(
    event_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_committee)
):
    db.query(SocialPoll).filter(SocialPoll.event_id == event_id).delete()
    
    teams = db.query(Team).filter(Team.event_id == event_id).all()
    for team in teams:
        team.social_vote_score = 0.0
        team.social_vote_total_votes = 0
        team.social_vote_last_updated = None
        from .evaluations import _recompute_combined_public
        _recompute_combined_public(team, db)
        
    db.commit()
    return {"status": "success", "message": "Social campaign data reset successfully."}
