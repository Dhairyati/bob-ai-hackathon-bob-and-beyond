"""MongoDB Atlas persistence layer for interactive dashboard state."""
from __future__ import annotations

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from backend.config import (
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_COLLECTION_ALERT_ACK,
    MONGODB_COLLECTION_ALERTS,
    MONGODB_COLLECTION_MAINTENANCE,
    MONGODB_COLLECTION_NOTES,
    MONGODB_COLLECTION_WATCHLIST,
    MONGODB_COLLECTION_ENGINES,
    MONGODB_COLLECTION_SERVICE_RECORDS,
)

_client: MongoClient | None = None
_db: Database | None = None


def get_db() -> Database:
    global _client, _db

    if _db is not None:
        return _db

    if not MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not set. Add it to the .env file.")

    _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
    _db = _client[MONGODB_DB]
    return _db


def get_collection(name: str) -> Collection:
    return get_db()[name]


def init_db() -> None:
    db = get_db()
    db.command("ping")

    existing = set(db.list_collection_names())
    required = [
        MONGODB_COLLECTION_ENGINES,
        MONGODB_COLLECTION_WATCHLIST,
        MONGODB_COLLECTION_NOTES,
        MONGODB_COLLECTION_MAINTENANCE,
        MONGODB_COLLECTION_ALERTS,
        MONGODB_COLLECTION_ALERT_ACK,
        MONGODB_COLLECTION_SERVICE_RECORDS,
    ]
    for c in required:
        if c not in existing:
            db.create_collection(c)

    db[MONGODB_COLLECTION_ENGINES].create_index([("engine_id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_WATCHLIST].create_index([("engine_id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_NOTES].create_index([("id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_NOTES].create_index([("engine_id", ASCENDING), ("created_at", ASCENDING)])
    db[MONGODB_COLLECTION_MAINTENANCE].create_index([("id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_MAINTENANCE].create_index([("engine_id", ASCENDING)])
    db[MONGODB_COLLECTION_ALERTS].create_index([("alert_id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_ALERTS].create_index([("timestamp", ASCENDING)])
    db[MONGODB_COLLECTION_ALERT_ACK].create_index([("alert_id", ASCENDING)], unique=True)

    # Service records indexes
    db[MONGODB_COLLECTION_SERVICE_RECORDS].create_index([("id", ASCENDING)], unique=True)
    db[MONGODB_COLLECTION_SERVICE_RECORDS].create_index([("engine_id", ASCENDING)])
    db[MONGODB_COLLECTION_SERVICE_RECORDS].create_index(
        [("engine_id", ASCENDING), ("cycle_at_service", ASCENDING)]
    )

    # Seed synthetic service history on first startup (idempotent — skips if already seeded)
    _seed_service_records_if_empty(db)


def _seed_service_records_if_empty(db) -> None:
    """
    Populate the service_records collection with synthetic data on first startup.
    Runs only if the collection is empty, so it is safe to call every time.
    No-ops gracefully if the fleet data is not yet loaded.
    """
    try:
        from backend.data_simulator import get_fleet_status
        from backend.service_records_seeder import seed_service_records

        fleet = get_fleet_status()
        engines_raw = fleet.get("engines", [])
        if not engines_raw:
            return  # Fleet not ready yet — will be seeded on next startup

        engine_ids = [int(e["engine_id"]) for e in engines_raw]
        engine_cycles = {int(e["engine_id"]): int(e.get("cycles", 100)) for e in engines_raw}

        inserted = seed_service_records(db, MONGODB_COLLECTION_SERVICE_RECORDS, engine_ids, engine_cycles)
        if inserted:
            print(f"  ✅  Seeded {inserted} synthetic service records.")
    except Exception as exc:  # noqa: BLE001
        # Non-fatal — the service history feature degrades gracefully to empty state
        print(f"  ⚠   Service records seeding skipped: {exc}")