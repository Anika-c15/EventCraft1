import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set python path so backend imports work
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import backend.app.models as models
from backend.app.ws import broadcast_sync

def main():
    engine = create_engine('sqlite:///backend/eventcraft.db')
    Session = sessionmaker(bind=engine)
    db = Session()
    
    event = db.query(models.Event).first()
    if not event:
        print("No event found in DB")
        sys.exit(1)
        
    event_id = event.id
    
    # 1. Clear judge scores
    deleted_scores = db.query(models.EvaluationScore).filter(models.EvaluationScore.event_id == event_id).delete()
    print(f"Deleted {deleted_scores} judge scores.")
    
    # 2. Clear peer reviews
    deleted_peer = db.query(models.PeerReview).filter(models.PeerReview.event_id == event_id).delete()
    print(f"Deleted {deleted_peer} peer reviews.")
    
    # 3. Reset teams to fresh state
    teams = db.query(models.Team).filter(models.Team.event_id == event_id).all()
    for t in teams:
        t.final_score = None
        t.rank = None
        t.judge_avg_score = None
        t.social_vote_score = None
        t.public_vote_score = None
        t.ai_proposed_score = None
        t.bias_rationale = None
        t.is_locked = False
        t.submission_status = 'Draft'
    print(f"Reset {len(teams)} teams' scores and submission status to Draft.")
    
    db.commit()
    
    # 4. Broadcast websocket message to trigger UI sync
    try:
        broadcast_sync(event_id, {"type": "score_submitted"})
        print("WebSocket broadcast sent successfully.")
    except Exception as e:
        print(f"WebSocket broadcast error: {e}")

if __name__ == '__main__':
    main()
