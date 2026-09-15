"""
Centralized configuration — reads from .env, never hardcodes paths.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# --- Paths ---
DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).resolve().parent.parent)))
MODELS_DIR = Path(os.getenv("MODELS_DIR", str(Path(__file__).resolve().parent.parent)))

# --- MongoDB ---
MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB = os.getenv("MONGODB_DB", "RUL")
MONGODB_COLLECTION_ENGINES = os.getenv("MONGODB_COLLECTION_ENGINES", "engines")
MONGODB_COLLECTION_ALERTS = os.getenv("MONGODB_COLLECTION_ALERTS", "custom_alerts")
MONGODB_COLLECTION_MAINTENANCE = os.getenv("MONGODB_COLLECTION_MAINTENANCE", "maintenance")
MONGODB_COLLECTION_NOTES = os.getenv("MONGODB_COLLECTION_NOTES", "notes")
MONGODB_COLLECTION_WATCHLIST = os.getenv("MONGODB_COLLECTION_WATCHLIST", "watchlist")
MONGODB_COLLECTION_ALERT_ACK = os.getenv("MONGODB_COLLECTION_ALERT_ACK", "alert_ack")
MONGODB_COLLECTION_SERVICE_RECORDS = os.getenv("MONGODB_COLLECTION_SERVICE_RECORDS", "service_records")

# --- Server ---
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# --- Model constants ---
COLUMN_NAMES = (
    ["engine_id", "cycle"]
    + [f"setting_{i}" for i in range(1, 4)]
    + [f"sensor_{i}" for i in range(1, 22)]
)
SETTINGS_COLS = [f"setting_{i}" for i in range(1, 4)]
SENSOR_COLS = [f"sensor_{i}" for i in range(1, 22)]

# --- Alert thresholds ---
ALERT_INFO_THRESHOLD = 60
ALERT_WARNING_THRESHOLD = 30
ALERT_CRITICAL_THRESHOLD = 15

# --- Mission window ---
MISSION_NEXT_CYCLE = int(os.getenv("MISSION_NEXT_CYCLE", "40"))   # cycles until next mission
MIN_RUL_FOR_MISSION = int(os.getenv("MIN_RUL_FOR_MISSION", "20")) # minimum RUL to be READY
