"""Database status route for SGPR evidence and runtime verification."""
from fastapi import APIRouter, HTTPException

from backend.config import (
    MONGODB_DB,
    MONGODB_COLLECTION_ALERT_ACK,
    MONGODB_COLLECTION_ALERTS,
    MONGODB_COLLECTION_MAINTENANCE,
    MONGODB_COLLECTION_NOTES,
    MONGODB_COLLECTION_WATCHLIST,
)
from backend.database import get_db, get_collection

router = APIRouter(prefix="/api/db", tags=["db"])


@router.get("/status")
async def db_status():
    """Return MongoDB health + collection counts used by this app."""
    try:
        db = get_db()
        db.command("ping")

        collections = {
            "watchlist": MONGODB_COLLECTION_WATCHLIST,
            "notes": MONGODB_COLLECTION_NOTES,
            "maintenance": MONGODB_COLLECTION_MAINTENANCE,
            "custom_alerts": MONGODB_COLLECTION_ALERTS,
            "alert_ack": MONGODB_COLLECTION_ALERT_ACK,
        }

        counts = {
            label: int(get_collection(name).count_documents({}))
            for label, name in collections.items()
        }

        return {
            "status": "ok",
            "db": MONGODB_DB,
            "collections": collections,
            "counts": counts,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database status check failed: {e}")
