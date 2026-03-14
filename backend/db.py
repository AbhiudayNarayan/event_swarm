"""
MongoDB connection layer using motor (async driver).
Collections:
  - events       : one document per event, with outputs sub-document
  - agent_runs   : audit log — one doc per orchestrator run
"""

import os
from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

_client = None
_db = None


def get_db():
    """Return the motor database handle. Lazily connects on first call."""
    global _client, _db
    if _db is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017").strip()
        db_name = os.getenv("MONGODB_DB", "event_swarm").strip()
        print(f"[db] Connecting to MongoDB: {uri[:30]}...  db={db_name}")
        _client = AsyncIOMotorClient(uri)
        _db = _client[db_name]
    return _db


def serialize_doc(doc: dict) -> dict:
    """Convert a MongoDB document to a JSON-safe dict.
    - Converts ObjectId _id to string 'id'
    - Removes raw _id field
    """
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def fresh_outputs():
    """Return the default outputs sub-document for a new event."""
    return {
        "generated_posts": [],
        "schedule_changes": [],
        "email_drafts": [],
        "chat_history": [],
    }
