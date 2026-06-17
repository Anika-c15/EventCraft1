import logging
import datetime
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .database import SessionLocal
from .models import SocialPoll, SocialPollStatus
from .social_service import get_platform, PlatformAPIError
from .config import settings
from .ws import broadcast_sync

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

async def _check_and_fetch_ended_polls():
    """
    Background job running every 15 minutes.
    Looks for posted polls that have ended. Attempts programmatic fetch;
    under Free Tier mode or on fetch failure, marks them as manual_pending.
    """
    logger.info("Scheduler poll watcher triggered.")
    db = SessionLocal()
    try:
        # Fetch polls that are posted, not manual_pending, and whose duration has expired
        now = datetime.datetime.utcnow()
        ended_polls = db.query(SocialPoll).filter(
            SocialPoll.status == SocialPollStatus.posted,
            SocialPoll.manual_pending == False,
            SocialPoll.ends_at <= now
        ).all()

        for poll in ended_polls:
            logger.info(f"Processing ended poll {poll.id} (platform: {poll.platform})")
            


            # 2. Attempt API fetch (LinkedIn or Mock, or real APIs if free-tier mode disabled)
            try:
                platform = get_platform(poll.platform)
                results = await platform.fetch_results(poll.platform_post_id or "")
                
                poll.votes = results["votes"]
                poll.total_votes = sum(results["votes"].values())
                poll.vote_snapshots = results.get("snapshots", [])
                poll.status = SocialPollStatus.completed
                poll.fetched_at = datetime.datetime.utcnow()
                
                # Check for low votes anomaly
                if poll.total_votes < settings.SOCIAL_MIN_VOTE_THRESHOLD:
                    poll.flagged = True
                    poll.flag_reason = "low_votes"
                
                # Check for velocity spike anomaly
                if poll.vote_snapshots and len(poll.vote_snapshots) > 1:
                    # check if >40% of total votes appeared in a single 15-minute interval
                    for i in range(1, len(poll.vote_snapshots)):
                        prev = sum(poll.vote_snapshots[i-1]["votes"].values())
                        curr = sum(poll.vote_snapshots[i]["votes"].values())
                        diff = curr - prev
                        if poll.total_votes > 0 and diff / poll.total_votes > 0.4:
                            poll.flagged = True
                            poll.flag_reason = "velocity_spike"
                            break

                db.commit()
                
                broadcast_sync(poll.event_id, {
                    "type": "social:poll_fetched",
                    "poll_id": poll.id,
                    "platform": poll.platform,
                    "total_votes": poll.total_votes,
                    "flagged": poll.flagged,
                    "flag_reason": poll.flag_reason,
                    "manual_pending": False
                })
                
            except PlatformAPIError as e:
                logger.warning(f"Platform fetch failed for poll {poll.id}: {str(e)}. Setting manual_pending=True")
                poll.manual_pending = True
                # Keep status as posted, so it is listed and can be updated manually
                db.commit()
                
                broadcast_sync(poll.event_id, {
                    "type": "social:poll_fetched",
                    "poll_id": poll.id,
                    "platform": poll.platform,
                    "total_votes": poll.total_votes,
                    "flagged": poll.flagged,
                    "manual_pending": True,
                    "error": str(e)
                })
            except Exception as e:
                logger.error(f"Unexpected error fetching results for poll {poll.id}: {str(e)}")
                poll.manual_pending = True
                db.commit()
                
                broadcast_sync(poll.event_id, {
                    "type": "social:poll_fetched",
                    "poll_id": poll.id,
                    "platform": poll.platform,
                    "total_votes": poll.total_votes,
                    "flagged": poll.flagged,
                    "manual_pending": True,
                    "error": str(e)
                })
    except Exception as e:
        logger.error(f"Error in scheduler check loop: {str(e)}")
    finally:
        db.close()

async def _scrape_pending_social_posts_job():
    """
    Background job running every 2 minutes.
    Looks for pending SocialPost submissions and scrapes their engagement metrics.
    """
    logger.info("Scheduler social post scraper job triggered.")
    db = SessionLocal()
    try:
        from .models import Event
        # Fetch active events
        active_events = db.query(Event).filter(Event.is_active == True).all()
        for event in active_events:
            from .routers.social_scraping import scrape_pending_posts
            scraped = await scrape_pending_posts(event.id, db)
            if scraped > 0:
                logger.info(f"Background scraped {scraped} social posts for event {event.id}")
    except Exception as e:
        logger.error(f"Error in background social post scraper job: {str(e)}")
    finally:
        db.close()

def start_scheduler():
    # Only register job if it's not already scheduled
    if not scheduler.get_job("poll_watcher"):
        scheduler.add_job(
            _check_and_fetch_ended_polls,
            trigger="interval",
            minutes=15,
            id="poll_watcher",
            replace_existing=True
        )
    if not scheduler.get_job("social_post_scraper"):
        scheduler.add_job(
            _scrape_pending_social_posts_job,
            trigger="interval",
            minutes=2,
            id="social_post_scraper",
            replace_existing=True
        )
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler social poll watcher started successfully.")
