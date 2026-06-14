"""
WebSocket connection manager.
Clients subscribe to an event_id channel and receive real-time updates.

Message types pushed to clients:
  - social:poll_posted  : poll successfully posted or manual URN confirmed
  - social:poll_fetched : poll votes fetched or marked as manual pending
  - social:scores_updated: team social_vote_score updated
  - social:pipeline_step: pipeline grid state updated (Generate/Post/Fetch/Calculate)
"""
import asyncio
import json
import logging
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # event_id -> set of active WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, event_id: str):
        await websocket.accept()
        self._connections[event_id].add(websocket)
        logger.info(f"WS connected: event={event_id}, total={len(self._connections[event_id])}")

    def disconnect(self, websocket: WebSocket, event_id: str):
        self._connections[event_id].discard(websocket)
        if not self._connections[event_id]:
            del self._connections[event_id]
        logger.info(f"WS disconnected: event={event_id}")

    async def broadcast(self, event_id: str, data: dict):
        """Send a JSON message to all clients subscribed to event_id."""
        if event_id not in self._connections:
            return

        dead = set()
        message = json.dumps(data)

        for ws in list(self._connections[event_id]):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)

        for ws in dead:
            self._connections[event_id].discard(ws)

    def broadcast_sync(self, event_id: str, data: dict):
        """
        Synchronous wrapper — safe to call from Celery workers or
        non-async contexts. Creates a new event loop if needed.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Schedule as a coroutine on the running loop
                asyncio.ensure_future(self.broadcast(event_id, data))
            else:
                loop.run_until_complete(self.broadcast(event_id, data))
        except RuntimeError:
            # No event loop — create one (Celery worker context)
            asyncio.run(self.broadcast(event_id, data))

    def active_connections(self, event_id: str) -> int:
        return len(self._connections.get(event_id, set()))


# Singleton instance shared across the app
manager = ConnectionManager()


# Module-level helpers so other modules can import directly
async def broadcast(event_id: str, data: dict):
    await manager.broadcast(event_id, data)


def broadcast_sync(event_id: str, data: dict):
    manager.broadcast_sync(event_id, data)
