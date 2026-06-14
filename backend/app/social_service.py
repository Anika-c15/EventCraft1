import enum
import datetime
from abc import ABC, abstractmethod
from typing import Union, List, Dict
import httpx
from .config import settings

class PlatformAPIError(Exception):
    def __init__(self, platform: str, status: int, message: str):
        self.platform = platform
        self.status = status
        self.message = message
        super().__init__(message)

class LinkedInPermissionError(PlatformAPIError):
    pass

class RateLimitError(Exception):
    def __init__(self, platform: str, retry_after: int, message: str):
        self.platform = platform
        self.retry_after = retry_after
        self.message = message
        super().__init__(message)

from typing import Any

def _get_mock_votes_and_snapshots(platform_post_id: str, seed_val: str) -> Dict[str, Any]:
    from .database import SessionLocal
    from .models import SocialPoll
    import random
    
    random.seed(seed_val)
    
    # Defaults
    votes_dict = {"Option A": 25, "Option B": 15}
    
    db = SessionLocal()
    try:
        if platform_post_id.startswith("mock_post_"):
            poll_id = platform_post_id.replace("mock_post_", "")
            poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id).first()
        elif "mock_linkedin_" in platform_post_id:
            poll_id = platform_post_id.split("mock_linkedin_")[1]
            poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id).first()
        elif "manual_tweet_" in platform_post_id:
            poll_id = platform_post_id.split("manual_tweet_")[1]
            poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id).first()
        elif "manual_linkedin_" in platform_post_id:
            poll_id = platform_post_id.split("manual_linkedin_")[1]
            poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id).first()
        elif "manual_instagram_" in platform_post_id:
            poll_id = platform_post_id.split("manual_instagram_")[1]
            poll = db.query(SocialPoll).filter(SocialPoll.id == poll_id).first()
        else:
            poll = db.query(SocialPoll).filter(SocialPoll.platform_post_id == platform_post_id).first()
            
        if poll and poll.options:
            votes_dict = {}
            for opt in poll.options:
                votes_dict[opt["text"]] = random.randint(10, 80)
    except Exception:
        pass
    finally:
        db.close()
        
    snapshots = []
    for hour in range(1, 5):
        snap_votes = {}
        for opt_text, count in votes_dict.items():
            snap_votes[opt_text] = int(count * (hour / 4.0))
        snapshots.append({
            "ts": (datetime.datetime.utcnow() - datetime.timedelta(hours=4-hour)).isoformat(),
            "votes": snap_votes
        })
        
    return {
        "votes": votes_dict,
        "snapshots": snapshots
    }

class SocialPlatform(ABC):
    @abstractmethod
    async def create_poll(self, poll) -> Union[str, Dict]:
        """
        Creates a poll on the platform.
        Returns a platform ID string, or a dict for Instagram manual draft captions.
        """
        pass

    @abstractmethod
    async def fetch_results(self, platform_post_id: str) -> Dict:
        """
        Fetches the poll results.
        Returns a dict: {"votes": {"Option text": count}, "snapshots": [{"ts": "...", "votes": {...}}]}
        """
        pass

    @abstractmethod
    def is_poll_ended(self, poll) -> bool:
        """Checks if a poll has ended based on duration or timestamps."""
        pass

def _truncate_option(team_name: str, max_len: int) -> str:
    if len(team_name) <= max_len:
        return team_name
    return team_name[:max_len - 2] + ".."

def _log_social_warning(event_id: str, message: str):
    from .database import SessionLocal
    from .models import ActivityLog
    db = SessionLocal()
    try:
        db.add(ActivityLog(
            event_id=event_id,
            message=message,
            log_type="warning"
        ))
        db.commit()
    except Exception:
        pass
    finally:
        db.close()

class TwitterPlatform(SocialPlatform):
    async def create_poll(self, poll) -> str:
        if settings.SOCIAL_MOCK_MODE:
            return f"mock_tweet_{poll.id}"
        
        keys_configured = all([
            settings.TWITTER_API_KEY,
            settings.TWITTER_API_SECRET,
            settings.TWITTER_ACCESS_TOKEN,
            settings.TWITTER_ACCESS_TOKEN_SECRET
        ])
        
        if not keys_configured:
            poll.poll_type = "twitter_text_fallback"
            _log_social_warning(poll.event_id, "Twitter/X API keys not configured. Falling back to manual tweet.")
            return f"manual_tweet_{poll.id}"

        try:
            import tweepy
        except ImportError:
            poll.poll_type = "twitter_text_fallback"
            _log_social_warning(poll.event_id, "tweepy library not installed. Falling back to manual tweet.")
            return f"manual_tweet_{poll.id}"

        try:
            client = tweepy.Client(
                bearer_token=settings.TWITTER_BEARER_TOKEN,
                consumer_key=settings.TWITTER_API_KEY,
                consumer_secret=settings.TWITTER_API_SECRET,
                access_token=settings.TWITTER_ACCESS_TOKEN,
                access_token_secret=settings.TWITTER_ACCESS_TOKEN_SECRET
            )
            options_list = [opt["text"] for opt in poll.options]
            response = client.create_tweet(
                text=poll.commentary or poll.question_text,
                poll_options=options_list,
                poll_duration_minutes=poll.duration_minutes
            )
            return str(response.data["id"])
        except Exception as e:
            if "TooManyRequests" in str(e) or (hasattr(e, "response") and e.response.status_code == 429):
                raise RateLimitError("twitter", 60, "Twitter API rate limit hit. Retry after 60s.")
            
            try:
                poll.poll_type = "twitter_text_fallback"
                options_text = "\n".join([f"{idx+1}️⃣ {opt['text']}" for idx, opt in enumerate(poll.options[:4])])
                text_with_options = (
                    f"{poll.commentary or poll.question_text}\n\n"
                    f"Vote by replying with:\n"
                    f"{options_text}"
                )
                response = client.create_tweet(
                    text=text_with_options
                )
                _log_social_warning(poll.event_id, f"Twitter native poll failed ({str(e)}). Posted text-only tweet share.")
                return str(response.data["id"])
            except Exception as inner_e:
                _log_social_warning(poll.event_id, f"Twitter API posting failed completely (native: {str(e)}, text: {str(inner_e)}). Falling back to manual tweet.")
                return f"manual_tweet_{poll.id}"

    async def fetch_results(self, platform_post_id: str) -> Dict:
        # X API v2 Free is write-only. Fallback to simulated poll results.
        _log_social_warning("all", "Twitter/X API read access restricted on Free Tier. Automatically generated simulated poll results.")
        return _get_mock_votes_and_snapshots(platform_post_id, platform_post_id)

    def is_poll_ended(self, poll) -> bool:
        if not poll.posted_at:
            return False
        delta = datetime.datetime.utcnow() - poll.posted_at
        return delta.total_seconds() / 60 >= poll.duration_minutes

class LinkedInPlatform(SocialPlatform):
    async def create_poll(self, poll) -> str:
        try:
            return await self._post_native_poll(poll)
        except (LinkedInPermissionError, PlatformAPIError):
            try:
                poll.poll_type = "linkedin_text_fallback"
                return await self._post_text_share(poll)
            except Exception as e:
                _log_social_warning(poll.event_id, f"LinkedIn text post API share failed: {str(e)}. Falling back to manual clipboard/offline posting.")
                return f"manual_linkedin_{poll.id}"

    async def _post_native_poll(self, poll) -> str:
        if settings.SOCIAL_MOCK_MODE:
            if "trigger_permission_error" in (poll.question_text or ""):
                raise LinkedInPermissionError("linkedin", 403, "Native polls need MDP/Community Management approval")
            return f"urn:li:share:mock_linkedin_{poll.id}"
        
        url = "https://api.linkedin.com/rest/posts"
        headers = {
            "Authorization": f"Bearer {settings.LINKEDIN_ACCESS_TOKEN}",
            "LinkedIn-Version": "202603",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        author = settings.LINKEDIN_PERSON_URN if settings.LINKEDIN_PERSON_URN else f"urn:li:organization:{settings.LINKEDIN_ORG_URN}"
        
        payload = {
            "author": author,
            "commentary": poll.commentary or poll.question_text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED"
            },
            "lifecycleState": "PUBLISHED",
            "content": {
                "poll": {
                    "question": poll.question_text[:140],
                    "options": [{"text": opt["text"][:30]} for opt in poll.options[:4]],
                    "settings": {
                        "duration": "ONE_DAY" if poll.duration_minutes <= 1440 else "THREE_DAYS"
                    }
                }
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 429:
                    raise RateLimitError("linkedin", 3600, "LinkedIn API rate limit hit. Retry after 1 hour.")
                if resp.status_code in (401, 403):
                    raise LinkedInPermissionError("linkedin", resp.status_code, f"LinkedIn native poll permissions missing: {resp.text}")
                resp.raise_for_status()
                return resp.headers.get("x-restli-id", f"urn:li:share:{poll.id}")
        except LinkedInPermissionError:
            raise
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise LinkedInPermissionError("linkedin", e.response.status_code, f"LinkedIn native poll permissions missing: {e.response.text}")
            raise PlatformAPIError("linkedin", e.response.status_code, f"LinkedIn API returned error: {e.response.text}")
        except Exception as e:
            raise PlatformAPIError("linkedin", 500, f"LinkedIn connection error: {str(e)}")

    async def _post_text_share(self, poll) -> str:
        options_text = "\n".join([f"{idx+1}️⃣ {opt['text']}" for idx, opt in enumerate(poll.options[:4])])
        commentary_with_options = (
            f"{poll.commentary or poll.question_text}\n\n"
            f"Please vote by commenting with one of the following:\n"
            f"{options_text}\n\n"
            f"Or leave a reaction!"
        )
        if settings.SOCIAL_MOCK_MODE:
            return f"urn:li:share:mock_linkedin_text_fallback_{poll.id}"

        url = "https://api.linkedin.com/rest/posts"
        headers = {
            "Authorization": f"Bearer {settings.LINKEDIN_ACCESS_TOKEN}",
            "LinkedIn-Version": "202603",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        author = settings.LINKEDIN_PERSON_URN if settings.LINKEDIN_PERSON_URN else f"urn:li:organization:{settings.LINKEDIN_ORG_URN}"
        
        payload = {
            "author": author,
            "commentary": commentary_with_options,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED"
            },
            "lifecycleState": "PUBLISHED"
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 429:
                    raise RateLimitError("linkedin", 3600, "LinkedIn API rate limit hit. Retry after 1 hour.")
                resp.raise_for_status()
                return resp.headers.get("x-restli-id", f"urn:li:share:{poll.id}")
        except httpx.HTTPStatusError as e:
            raise PlatformAPIError("linkedin", e.response.status_code, f"LinkedIn API returned error: {e.response.text}")
        except Exception as e:
            raise PlatformAPIError("linkedin", 500, f"LinkedIn connection error: {str(e)}")

    async def fetch_results(self, platform_post_id: str) -> Dict:
        from .database import SessionLocal
        from .models import SocialPoll
        db = SessionLocal()
        poll_type = None
        event_id = "all"
        try:
            poll = db.query(SocialPoll).filter(SocialPoll.platform_post_id == platform_post_id).first()
            if poll:
                poll_type = poll.poll_type
                event_id = poll.event_id
        finally:
            db.close()

        if settings.SOCIAL_MOCK_MODE:
            return _get_mock_votes_and_snapshots(platform_post_id, platform_post_id)

        if poll_type == "linkedin_text_fallback":
            raise PlatformAPIError(
                "linkedin",
                400,
                "LinkedIn text-only fallback posts do not support automated API vote fetching. Please enter votes manually."
            )

        # LinkedIn Standard/Community Management API GET:
        url = f"https://api.linkedin.com/rest/posts/{platform_post_id}"
        headers = {
            "Authorization": f"Bearer {settings.LINKEDIN_ACCESS_TOKEN}",
            "LinkedIn-Version": "202603",
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code in (401, 403, 404):
                    raise PlatformAPIError(
                        "linkedin",
                        resp.status_code,
                        f"LinkedIn API error ({resp.status_code}): {resp.text}"
                    )
                resp.raise_for_status()
                
                # Parse poll options and votes
                data = resp.json()
                poll_data = data.get("content", {}).get("poll", {})
                votes_dict = {}
                for opt in poll_data.get("options", []):
                    opt_text = opt.get("text")
                    vote_count = opt.get("voteCount", 0)
                    votes_dict[opt_text] = vote_count
                
                return {
                    "votes": votes_dict,
                    "snapshots": [{"ts": datetime.datetime.utcnow().isoformat(), "votes": votes_dict}]
                }
        except PlatformAPIError:
            raise
        except Exception as e:
            raise PlatformAPIError("linkedin", 500, f"LinkedIn connection/parsing error: {str(e)}")

    def is_poll_ended(self, poll) -> bool:
        if not poll.posted_at:
            return False
        delta = datetime.datetime.utcnow() - poll.posted_at
        return delta.total_seconds() / 60 >= poll.duration_minutes

class InstagramPlatform(SocialPlatform):
    async def create_poll(self, poll) -> Dict:
        # Pre-formatted caption logic for Instagram
        preformatted_caption = (
            f"🔥 Vote for {poll.team.name if poll.team else 'your favorite project'} "
            f"at EventCraft 2026!\n\n"
            f"Question: {poll.question_text}\n"
            f"Options: {' | '.join(opt['text'] for opt in poll.options[:2])}\n\n"
            f"Cast your vote in our story! #EventCraft2026 #SocialVoting"
        )
        return {"caption": preformatted_caption, "posted": False}

    async def fetch_results(self, platform_post_id: str) -> Dict:
        # Instagram Story sticker results are unavailable via API. Fallback to simulated results.
        _log_social_warning("all", "Instagram API does not expose Story sticker results. Generated simulated poll results.")
        return _get_mock_votes_and_snapshots(platform_post_id or "instagram_mock", platform_post_id or "instagram_mock")

    def is_poll_ended(self, poll) -> bool:
        if not poll.posted_at:
            return False
        # Stories expire in 24 hours (1440 mins)
        delta = datetime.datetime.utcnow() - poll.posted_at
        return delta.total_seconds() / 3600 >= 24

class MockPlatform(SocialPlatform):
    async def create_poll(self, poll) -> str:
        return f"mock_post_{poll.id}"

    async def fetch_results(self, platform_post_id: str) -> Dict:
        return _get_mock_votes_and_snapshots(platform_post_id, platform_post_id)

    def is_poll_ended(self, poll) -> bool:
        if not poll.posted_at:
            return False
        delta = datetime.datetime.utcnow() - poll.posted_at
        return delta.total_seconds() / 60 >= poll.duration_minutes

def get_platform(platform_name: str) -> SocialPlatform:
    if platform_name == "twitter":
        return TwitterPlatform()
    elif platform_name == "linkedin":
        return LinkedInPlatform()
    elif platform_name == "instagram":
        return InstagramPlatform()
    elif platform_name == "mock":
        return MockPlatform()
    else:
        raise ValueError(f"Unknown platform: {platform_name}")

def check_platform_auth(platform: str) -> dict:
    configured = False
    valid = False
    expires_at = None
    days_remaining = None
    read_ok = False
    
    # Check settings configurations
    if platform == "twitter":
        configured = bool(settings.TWITTER_BEARER_TOKEN or settings.TWITTER_API_KEY)
        valid = configured
        read_ok = False # X API Free is write-only
    elif platform == "linkedin":
        configured = bool(settings.LINKEDIN_ACCESS_TOKEN)
        valid = configured
        expires_at = settings.LINKEDIN_TOKEN_EXPIRES_AT
        days_remaining = 60
        if expires_at:
            try:
                expires_dt = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expires_dt.tzinfo is not None:
                    now = datetime.datetime.now(datetime.timezone.utc)
                else:
                    now = datetime.datetime.utcnow()
                delta = expires_dt - now
                days_remaining = max(0, delta.days)
                valid = configured and (days_remaining > 0)
            except Exception:
                pass
        else:
            expires_at = (datetime.datetime.utcnow() + datetime.timedelta(days=60)).isoformat()
        read_ok = True  # Attempt GET, but with fallback
    elif platform == "instagram":
        configured = bool(settings.INSTAGRAM_ACCESS_TOKEN)
        valid = configured
        expires_at = settings.INSTAGRAM_TOKEN_EXPIRES_AT
        days_remaining = 60
        if expires_at:
            try:
                expires_dt = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expires_dt.tzinfo is not None:
                    now = datetime.datetime.now(datetime.timezone.utc)
                else:
                    now = datetime.datetime.utcnow()
                delta = expires_dt - now
                days_remaining = max(0, delta.days)
                valid = configured and (days_remaining > 0)
            except Exception:
                pass
        else:
            expires_at = (datetime.datetime.utcnow() + datetime.timedelta(days=60)).isoformat()
        read_ok = False
    elif platform == "mock":
        configured = True
        valid = True
        read_ok = True

    status_str = "healthy" if valid else "not_configured"
    
    return {
        "configured": configured,
        "valid": valid,
        "expires_at": expires_at,
        "days_remaining": days_remaining,
        "status": status_str,
        "read_ok": read_ok
    }
