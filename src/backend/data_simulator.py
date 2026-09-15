"""
Data simulator — loads C-MAPSS test data and runs the model to produce
a realistic fleet state for the dashboard demo.

On startup, checks for a disk cache first.  If the cache matches the
current data files it is loaded in seconds.  Otherwise the full
prediction pipeline runs and the result is cached for next time.
"""
import os
import hashlib
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timedelta
import random
import threading

from backend.config import DATA_DIR, COLUMN_NAMES, SETTINGS_COLS, SENSOR_COLS
from backend.config import ALERT_INFO_THRESHOLD, ALERT_WARNING_THRESHOLD, ALERT_CRITICAL_THRESHOLD
from backend.config import (
    MONGODB_COLLECTION_ALERT_ACK,
    MONGODB_COLLECTION_ALERTS,
    MONGODB_COLLECTION_MAINTENANCE,
    MONGODB_COLLECTION_NOTES,
    MONGODB_COLLECTION_WATCHLIST,
    MONGODB_COLLECTION_ENGINES,
)
from backend.database import get_collection

# ── In-memory stores ──────────────────────────────────────────────────
fleet_data: list[dict] = []  # one dict per engine
engine_details: dict[str, dict] = {}  # engine_id -> detailed data
alerts: list[dict] = []  # alert log
scheduled_maintenance: list[dict] = []  # maintenance blocks
_preprocessed_dfs: dict[str, pd.DataFrame] = {}  # dataset tag -> preprocessed df
_raw_dfs: dict[str, pd.DataFrame] = {}  # dataset tag -> raw df
_alert_id_counter = 0
_maint_id_counter = 0

# ── Interactive feature stores ────────────────────────────────────────
_watchlist: set[str] = set()  # engine IDs the user is watching
_engine_notes: dict[str, list[dict]] = {}  # engine_id -> list of notes
_note_id_counter = 0

# ── Cache helpers ─────────────────────────────────────────────────────
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache")
CACHE_FILE = os.path.join(CACHE_DIR, "fleet_cache.joblib")


def _next_custom_alert_id() -> int:
    """Return the next globally unique alert ID."""
    max_mem = max([int(a.get("id", 0)) for a in alerts], default=0)
    coll = get_collection(MONGODB_COLLECTION_ALERTS)
    doc = coll.find_one(sort=[("alert_id", -1)], projection={"_id": 0, "alert_id": 1})
    max_db = int(doc["alert_id"]) if doc and "alert_id" in doc else 0
    return max(max_mem, max_db) + 1


def _next_numeric_id(collection_name: str, field_name: str, in_memory_max: int = 0) -> int:
    coll = get_collection(collection_name)
    doc = coll.find_one(sort=[(field_name, -1)], projection={"_id": 0, field_name: 1})
    db_max = int(doc[field_name]) if doc and field_name in doc else 0
    return max(int(in_memory_max), db_max) + 1


def _load_persistent_state() -> None:
    """Hydrate watchlist/notes/maintenance/custom-alert state from MongoDB."""
    global _watchlist, _engine_notes, _note_id_counter, scheduled_maintenance, _maint_id_counter

    watch_coll = get_collection(MONGODB_COLLECTION_WATCHLIST)
    notes_coll = get_collection(MONGODB_COLLECTION_NOTES)
    maint_coll = get_collection(MONGODB_COLLECTION_MAINTENANCE)
    alerts_coll = get_collection(MONGODB_COLLECTION_ALERTS)
    ack_coll = get_collection(MONGODB_COLLECTION_ALERT_ACK)

    watch_rows = list(watch_coll.find({}, {"_id": 0, "engine_id": 1}))
    _watchlist = {str(r["engine_id"]) for r in watch_rows if "engine_id" in r}

    note_rows = list(notes_coll.find({}, {"_id": 0}).sort([("created_at", -1), ("id", -1)]))
    notes_map: dict[str, list[dict]] = {}
    max_note_id = 0
    for r in note_rows:
        note_id = int(r.get("id", 0))
        max_note_id = max(max_note_id, note_id)
        eid = str(r.get("engine_id", ""))
        if not eid:
            continue
        notes_map.setdefault(eid, []).append(
            {"id": note_id, "text": str(r.get("text", "")), "timestamp": str(r.get("created_at", ""))}
        )
    _engine_notes = notes_map
    _note_id_counter = max_note_id

    maint_rows = list(maint_coll.find({}, {"_id": 0}).sort("id", 1))
    scheduled_maintenance = [
        {
            "id": int(r["id"]),
            "engine_id": str(r["engine_id"]),
            "start_cycle": int(r["start_cycle"]),
            "end_cycle": int(r["end_cycle"]),
            "type": str(r["type"]),
            "notes": str(r.get("notes", "")),
        }
        for r in maint_rows
        if "id" in r and "engine_id" in r and "start_cycle" in r and "end_cycle" in r and "type" in r
    ]
    _maint_id_counter = max([m["id"] for m in scheduled_maintenance], default=0)

    custom_rows = list(alerts_coll.find({}, {"_id": 0}).sort("timestamp", -1))
    existing_ids = {int(a["id"]) for a in alerts}
    for r in custom_rows:
        aid = int(r.get("alert_id", 0))
        if aid == 0 or aid in existing_ids:
            continue
        alerts.append(
            {
                "id": aid,
                "engine_id": str(r.get("engine_id", "")),
                "severity": str(r.get("severity", "info")),
                "message": str(r.get("message", "")),
                "timestamp": str(r.get("timestamp", datetime.now().isoformat())),
                "acknowledged": bool(r.get("acknowledged", False)),
                "custom": True,
            }
        )

    ack_rows = list(ack_coll.find({}, {"_id": 0, "alert_id": 1, "acknowledged": 1}))
    ack_map = {int(r["alert_id"]): bool(r.get("acknowledged", True)) for r in ack_rows if "alert_id" in r}

    for a in alerts:
        aid = int(a["id"])
        if aid in ack_map:
            a["acknowledged"] = ack_map[aid]


def _save_engines_to_db() -> None:
    """Persist all engines to MongoDB (runs in background thread to avoid blocking startup)."""
    def _async_save():
        try:
            engines_coll = get_collection(MONGODB_COLLECTION_ENGINES)
            
            # Clear existing engines
            engines_coll.delete_many({})
            
            # Insert fleet_data and engine_details as documents
            for engine in fleet_data:
                eid = str(engine["engine_id"])
                doc = dict(engine)  # copy engine card data
                doc["_id"] = eid  # use engine_id as document ID
                
                # Add detailed engine info if available
                if eid in engine_details:
                    doc["details"] = engine_details[eid]
                
                try:
                    engines_coll.insert_one(doc)
                except Exception as e:
                    print(f"⚠  Failed to save engine {eid} to DB: {e}")
            
            print(f"✅  {len(fleet_data)} engines persisted to MongoDB")
        except Exception as e:
            print(f"⚠  Failed to save engines to database: {e}")
    
    # Run in background thread to not block startup
    thread = threading.Thread(target=_async_save, daemon=True)
    thread.start()


def _load_engines_from_db() -> bool:
    """Load engines from MongoDB. Returns True if successful."""
    global fleet_data, engine_details
    try:
        engines_coll = get_collection(MONGODB_COLLECTION_ENGINES)
        docs = list(engines_coll.find({}, {"_id": 0}))
        
        if not docs:
            return False
        
        fleet_data.clear()
        engine_details.clear()
        
        for doc in docs:
            # Extract engine card data
            engine_card = {k: v for k, v in doc.items() if k != "details"}
            fleet_data.append(engine_card)
            
            # Extract detailed data if present
            if "details" in doc:
                eid = str(engine_card["engine_id"])
                engine_details[eid] = doc["details"]
        
        # Re-sort by RUL
        fleet_data.sort(key=lambda e: e["rul"])
        
        print(f"⚡  Loaded {len(fleet_data)} engines from MongoDB")
        return True
    except Exception as e:
        print(f"⚠  Failed to load engines from database: {e}")
        return False


def _data_fingerprint() -> str:
    """Hash based on test file sizes + modification times."""
    parts = []
    for tag in ["FD001", "FD002", "FD003", "FD004"]:
        path = os.path.join(DATA_DIR, f"test_{tag}.txt")
        if os.path.exists(path):
            stat = os.stat(path)
            parts.append(f"{tag}:{stat.st_size}:{int(stat.st_mtime)}")
    return hashlib.md5("|".join(parts).encode()).hexdigest()


def _save_cache():
    """Persist fleet state to disk."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    payload = {
        "fingerprint": _data_fingerprint(),
        "fleet_data": fleet_data,
        "engine_details": engine_details,
        "alerts": alerts,
        "raw_dfs": _raw_dfs,
        "preprocessed_dfs": _preprocessed_dfs,
        "alert_id_counter": _alert_id_counter,
    }
    joblib.dump(payload, CACHE_FILE, compress=3)
    print(f"💾  Cache saved → {CACHE_FILE}")


def _load_cache() -> bool:
    """Try to restore fleet state from disk cache. Returns True on success."""
    global fleet_data, engine_details, alerts, _raw_dfs, _preprocessed_dfs, _alert_id_counter
    if not os.path.exists(CACHE_FILE):
        return False
    try:
        payload = joblib.load(CACHE_FILE)
        if payload.get("fingerprint") != _data_fingerprint():
            print("⚠  Cache fingerprint mismatch — rebuilding")
            return False
        fleet_data = payload["fleet_data"]
        engine_details = payload["engine_details"]
        alerts = payload["alerts"]
        _raw_dfs = payload["raw_dfs"]
        _preprocessed_dfs = payload["preprocessed_dfs"]
        _alert_id_counter = payload["alert_id_counter"]
        print(f"⚡  Loaded from cache: {len(fleet_data)} engines, {len(alerts)} alerts")
        return True
    except Exception as e:
        print(f"⚠  Cache load failed ({e}) — rebuilding")
        return False


def load_fleet_data(force_rebuild: bool = False):
    """
    Load C-MAPSS test files, preprocess, predict, and build fleet state.
    Called once at startup after models are loaded.
    Uses disk cache when available for instant restarts.
    """
    # ── Try cache first ───────────────────────────────────────────
    if not force_rebuild and _load_cache():
        _save_engines_to_db()  # Always persist engines to database
        _load_persistent_state()
        if not scheduled_maintenance:
            _seed_demo_maintenance()
        return

    from backend.model_loader import (
        preprocess_dataframe, predict_all_engines,
        predict_single_engine, predict_engine_history,
        feature_cols, key_sensors, SEQ_LEN, RUL_CAP,
        models, attention_model
    )
    global fleet_data, engine_details, alerts

    fleet_data.clear()
    engine_details.clear()
    alerts.clear()

    datasets = []
    for tag in ["FD001", "FD002", "FD003", "FD004"]:
        path = os.path.join(DATA_DIR, f"test_{tag}.txt")
        if os.path.exists(path):
            datasets.append((tag, path))

    if not datasets:
        print("⚠  No C-MAPSS test files found — using synthetic demo data")
        _generate_synthetic_fleet()
        _save_engines_to_db()  # Persist synthetic engines
        _load_persistent_state()
        if not scheduled_maintenance:
            _seed_demo_maintenance()
        return

    global_engine_id = 1  # unique across datasets

    for tag, path in datasets:
        print(f"Loading {tag}...")
        raw_df = pd.read_csv(path, sep=r"\s+", header=None).iloc[:, :26]
        raw_df.columns = COLUMN_NAMES

        # Remap engine_id to global unique
        id_map = {}
        for old_id in sorted(raw_df["engine_id"].unique()):
            id_map[old_id] = global_engine_id
            global_engine_id += 1
        raw_df["engine_id"] = raw_df["engine_id"].map(id_map)

        _raw_dfs[tag] = raw_df.copy()

        # Preprocess
        proc_df = preprocess_dataframe(raw_df)
        _preprocessed_dfs[tag] = proc_df

        # Predict all engines (no TTA for speed during startup)
        results = predict_all_engines(proc_df, use_tta=False)

        for res in results:
            eid = res["engine_id"]
            eng_raw = raw_df[raw_df["engine_id"] == eid].sort_values("cycle")
            eng_proc = proc_df[proc_df["engine_id"] == eid].sort_values("cycle")

            # Engine card data
            card = {
                "engine_id": str(eid),
                "dataset": tag,
                "rul": res["rul"],
                "health_status": res["health_status"],
                "health_probs": res["health_probs"],
                "confidence_std": res["confidence_std"],
                "cycles": res["cycles"],
                "last_updated": datetime.now().isoformat(),
            }
            fleet_data.append(card)

            # Detailed data for engine detail page
            sensor_data = {}
            for s in SENSOR_COLS:
                if s in eng_raw.columns:
                    sensor_data[s] = eng_raw[s].tolist()

            # Cumulative degradation for key sensors
            cumdeg_data = {}
            for s in key_sensors:
                col = f"{s}_cumdeg"
                if col in eng_proc.columns:
                    cumdeg_data[s] = eng_proc[col].tolist()

            # Rolling stats for key sensors
            rolling_data = {}
            for s in key_sensors:
                cols_available = {}
                for suffix in ["_rmean5", "_rmean30", "_deviation"]:
                    col = f"{s}{suffix}"
                    if col in eng_proc.columns:
                        cols_available[suffix.lstrip("_")] = eng_proc[col].tolist()
                if cols_available:
                    rolling_data[s] = cols_available

            engine_details[str(eid)] = {
                "engine_id": str(eid),
                "dataset": tag,
                "rul": res["rul"],
                "health_status": res["health_status"],
                "health_probs": res["health_probs"],
                "confidence_std": res["confidence_std"],
                "cycles": res["cycles"],
                "cycle_list": eng_raw["cycle"].tolist(),
                "sensor_data": sensor_data,
                "cumdeg_data": cumdeg_data,
                "rolling_data": rolling_data,
                "attention_weights": res.get("attention_weights"),
                "settings": {
                    s: eng_raw[s].tolist() for s in SETTINGS_COLS
                },
            }

            # Generate alerts
            _generate_alerts_for_engine(card)

    # Sort fleet by RUL ascending (most critical first)
    fleet_data.sort(key=lambda e: e["rul"])

    # Compute RUL history for a subset of engines (top 30 by interest)
    interesting_engines = [e for e in fleet_data if e["rul"] < 80][:30]
    for eng in interesting_engines:
        eid = int(eng["engine_id"])
        # Find which preprocessed df contains this engine
        for tag, proc_df in _preprocessed_dfs.items():
            if eid in proc_df["engine_id"].values:
                try:
                    history = predict_engine_history(proc_df, eid)
                    engine_details[str(eid)]["rul_history"] = history
                except Exception as e:
                    print(f"  ⚠  History for engine {eid}: {e}")
                break

    print(f"\n✅  Fleet loaded: {len(fleet_data)} engines across {len(datasets)} datasets")
    print(f"   Alerts generated: {len(alerts)}")

    # Save to disk cache for instant restarts
    _save_cache()
    
    # Persist all engines to MongoDB
    _save_engines_to_db()

    _load_persistent_state()

    # Seed a few demo maintenance blocks
    if not scheduled_maintenance:
        _seed_demo_maintenance()


def _generate_alerts_for_engine(engine: dict):
    """Create alerts based on RUL thresholds."""
    global _alert_id_counter
    rul = engine["rul"]
    eid = engine["engine_id"]
    base_time = datetime.now() - timedelta(minutes=random.randint(0, 1440))

    if rul < ALERT_CRITICAL_THRESHOLD:
        _alert_id_counter += 1
        alerts.append({
            "id": _alert_id_counter,
            "engine_id": eid,
            "severity": "critical",
            "message": f"Engine {eid} RUL critically low at {rul:.0f} cycles — immediate inspection required",
            "rul": rul,
            "timestamp": base_time.isoformat(),
            "acknowledged": False,
        })
    elif rul < ALERT_WARNING_THRESHOLD:
        _alert_id_counter += 1
        alerts.append({
            "id": _alert_id_counter,
            "engine_id": eid,
            "severity": "warning",
            "message": f"Engine {eid} RUL at {rul:.0f} cycles — schedule maintenance soon",
            "rul": rul,
            "timestamp": base_time.isoformat(),
            "acknowledged": False,
        })
    elif rul < ALERT_INFO_THRESHOLD:
        _alert_id_counter += 1
        alerts.append({
            "id": _alert_id_counter,
            "engine_id": eid,
            "severity": "info",
            "message": f"Engine {eid} RUL at {rul:.0f} cycles — monitoring",
            "rul": rul,
            "timestamp": base_time.isoformat(),
            "acknowledged": False,
        })


def _generate_synthetic_fleet():
    """Fallback: generate synthetic fleet data when no C-MAPSS files found."""
    global fleet_data, engine_details, alerts
    random.seed(42)
    np.random.seed(42)

    for i in range(1, 41):
        rul = random.choice([
            random.uniform(2, 15),   # critical
            random.uniform(15, 30),  # warning-critical
            random.uniform(30, 60),  # warning
            random.uniform(60, 125), # healthy
            random.uniform(60, 125), # healthy (more weight)
        ])
        rul = round(rul, 1)
        cycles = random.randint(30, 400)

        if rul < 15:
            health = "Critical"
            probs = [0.05, 0.15, 0.80]
        elif rul < 30:
            health = "Warning" if random.random() > 0.3 else "Critical"
            probs = [0.10, 0.60, 0.30]
        elif rul < 60:
            health = "Warning"
            probs = [0.15, 0.70, 0.15]
        else:
            health = "Healthy"
            probs = [0.85, 0.12, 0.03]

        dataset = random.choice(["FD001", "FD002", "FD003", "FD004"])

        card = {
            "engine_id": str(i),
            "dataset": dataset,
            "rul": rul,
            "health_status": health,
            "health_probs": probs,
            "confidence_std": round(random.uniform(2, 8), 2),
            "cycles": cycles,
            "last_updated": datetime.now().isoformat(),
        }
        fleet_data.append(card)

        # Synthetic sensor data
        t = np.arange(cycles)
        sensor_data = {}
        for j in range(1, 22):
            base = 500 + j * 10
            degradation = (t / cycles) * (5 + random.uniform(0, 3))
            noise = np.random.normal(0, 0.5, cycles)
            sensor_data[f"sensor_{j}"] = (base + degradation + noise).tolist()

        # Synthetic cumdeg
        cumdeg_data = {}
        for j in [2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 17, 20, 21]:
            cumdeg = np.cumsum(np.random.normal(0.01, 0.005, cycles)).tolist()
            cumdeg_data[f"sensor_{j}"] = cumdeg

        # Synthetic attention weights
        attn = np.random.dirichlet(np.ones(50) * 0.5).tolist()

        # Synthetic RUL history
        rul_history = []
        for c in range(0, cycles, max(1, cycles // 25)):
            frac = c / max(cycles, 1)
            hist_rul = max(0, rul + (125 - rul) * (1 - frac) + random.uniform(-5, 5))
            h = "Healthy" if hist_rul > 60 else ("Warning" if hist_rul > 30 else "Critical")
            rul_history.append({"cycle": c + 1, "rul": round(hist_rul, 1), "health_status": h})

        engine_details[str(i)] = {
            "engine_id": str(i),
            "dataset": dataset,
            "rul": rul,
            "health_status": health,
            "health_probs": probs,
            "confidence_std": card["confidence_std"],
            "cycles": cycles,
            "cycle_list": (t + 1).tolist(),
            "sensor_data": sensor_data,
            "cumdeg_data": cumdeg_data,
            "rolling_data": {},
            "attention_weights": attn,
            "settings": {f"setting_{j}": np.random.uniform(0, 1, cycles).tolist() for j in range(1, 4)},
            "rul_history": rul_history,
        }

        _generate_alerts_for_engine(card)

    fleet_data.sort(key=lambda e: e["rul"])
    print(f"✅  Synthetic fleet generated: {len(fleet_data)} engines, {len(alerts)} alerts")


# ── Query functions ───────────────────────────────────────────────────

def get_fleet_status() -> dict:
    """Fleet overview for the dashboard."""
    total = len(fleet_data)
    healthy = sum(1 for e in fleet_data if e["health_status"] == "Healthy")
    warning = sum(1 for e in fleet_data if e["health_status"] == "Warning")
    critical = sum(1 for e in fleet_data if e["health_status"] == "Critical")
    grounded = sum(1 for e in fleet_data if e["rul"] < 5)

    return {
        "summary": {
            "total": total,
            "healthy": healthy,
            "warning": warning,
            "critical": critical,
            "grounded": grounded,
        },
        "engines": fleet_data,
    }


def get_engine_detail(engine_id: str) -> dict | None:
    """Full engine detail for the engine detail page.
    Lazily computes rul_history on first access if not already cached."""
    detail = engine_details.get(engine_id)
    if detail is None:
        return None
    # Compute history on demand if missing (engines with RUL >= 80 skipped at startup)
    if "rul_history" not in detail or not detail["rul_history"]:
        try:
            from backend.model_loader import predict_engine_history
            eid = int(engine_id)
            for tag, proc_df in _preprocessed_dfs.items():
                if eid in proc_df["engine_id"].values:
                    detail["rul_history"] = predict_engine_history(proc_df, eid)
                    break
        except Exception as e:
            print(f"  ⚠  On-demand history for engine {engine_id}: {e}")
    return detail


def get_alerts(severity: str | None = None, acknowledged: bool | None = None) -> list[dict]:
    """Get alerts, optionally filtered."""
    result = alerts
    if severity:
        result = [a for a in result if a["severity"] == severity]
    if acknowledged is not None:
        result = [a for a in result if a["acknowledged"] == acknowledged]
    return sorted(result, key=lambda a: a["timestamp"], reverse=True)


def acknowledge_alert(alert_id: int) -> bool:
    """Mark an alert as acknowledged."""
    found = False
    for a in alerts:
        if a["id"] == alert_id:
            a["acknowledged"] = True
            found = True
            break

    if found:
        now = datetime.now().isoformat()
        get_collection(MONGODB_COLLECTION_ALERT_ACK).update_one(
            {"alert_id": int(alert_id)},
            {"$set": {"acknowledged": True, "updated_at": now}},
            upsert=True,
        )
        get_collection(MONGODB_COLLECTION_ALERTS).update_one(
            {"alert_id": int(alert_id)},
            {"$set": {"acknowledged": True}},
        )
    return found


def get_analytics() -> dict:
    """Aggregated analytics for the fleet analytics page."""
    ruls = [e["rul"] for e in fleet_data]
    # RUL distribution in buckets
    buckets = {"0-15": 0, "15-30": 0, "30-60": 0, "60-90": 0, "90-125": 0}
    for r in ruls:
        if r < 15:
            buckets["0-15"] += 1
        elif r < 30:
            buckets["15-30"] += 1
        elif r < 60:
            buckets["30-60"] += 1
        elif r < 90:
            buckets["60-90"] += 1
        else:
            buckets["90-125"] += 1

    # Per-dataset stats
    dataset_stats = {}
    for e in fleet_data:
        ds = e["dataset"]
        if ds not in dataset_stats:
            dataset_stats[ds] = {"count": 0, "avg_rul": 0, "ruls": []}
        dataset_stats[ds]["count"] += 1
        dataset_stats[ds]["ruls"].append(e["rul"])

    for ds in dataset_stats:
        dataset_stats[ds]["avg_rul"] = round(
            sum(dataset_stats[ds]["ruls"]) / len(dataset_stats[ds]["ruls"]), 1
        )
        del dataset_stats[ds]["ruls"]

    return {
        "rul_distribution": buckets,
        "health_breakdown": {
            "Healthy": sum(1 for e in fleet_data if e["health_status"] == "Healthy"),
            "Warning": sum(1 for e in fleet_data if e["health_status"] == "Warning"),
            "Critical": sum(1 for e in fleet_data if e["health_status"] == "Critical"),
        },
        "dataset_stats": dataset_stats,
        "fleet_avg_rul": round(sum(ruls) / max(len(ruls), 1), 1),
        "total_engines": len(fleet_data),
    }


def simulate_what_if(engine_id: str, start_cycle: int, alt_offset: float, mach_offset: float, tra_offset: float) -> list[dict]:
    """
    Simulate a What-If scenario.
    Takes the raw data for an engine, applies the condition offsets from 'start_cycle' onwards,
    runs the full preprocessing pipeline, and generates a new predicted RUL history curve.
    """
    from backend.model_loader import preprocess_dataframe, predict_engine_history
    import pandas as pd
    
    eid = int(engine_id)
    eng_raw = None
    
    # 1. Find the raw data for this engine
    for tag, raw_df in _raw_dfs.items():
        if eid in raw_df["engine_id"].values:
            eng_raw = raw_df[raw_df["engine_id"] == eid].copy()
            break
            
    if eng_raw is None:
        raise ValueError(f"Engine {engine_id} not found in raw datasets")
        
    # Ensure numeric columns accept float perturbations.
    eng_raw[SENSOR_COLS] = eng_raw[SENSOR_COLS].astype(np.float64)
    eng_raw[SETTINGS_COLS] = eng_raw[SETTINGS_COLS].astype(np.float64)

    # 2. Apply offsets to operating conditions from start_cycle onwards
    # setting_1: Altitude, setting_2: Mach, setting_3: TRA
    mask = eng_raw["cycle"] >= start_cycle
    eng_raw.loc[mask, "setting_1"] += alt_offset
    eng_raw.loc[mask, "setting_2"] += mach_offset
    eng_raw.loc[mask, "setting_3"] += tra_offset

    # 2b. Propagate offsets into sensor trajectories.
    # The trained model consumes engineered sensor features (not raw settings directly),
    # so this proxy stress mapping ensures What-If controls produce observable effects.
    if mask.any():
        norm_alt = alt_offset / 0.05
        norm_mach = mach_offset / 0.5
        norm_tra = tra_offset / 20.0
        stress = 0.25 * norm_alt + 0.35 * norm_mach + 0.40 * norm_tra

        if abs(stress) > 1e-9:
            idx = np.where(mask.values)[0]
            progress = np.linspace(0.15, 1.0, len(idx), dtype=np.float64)

            for s in SENSOR_COLS:
                if s not in eng_raw.columns:
                    continue
                sigma = float(eng_raw[s].std())
                if not np.isfinite(sigma) or sigma == 0.0:
                    sigma = 1.0

                # Progressive offset: later cycles are affected more strongly.
                delta = stress * sigma * 0.12
                eng_raw.loc[mask, s] = eng_raw.loc[mask, s].values + (delta * progress)
    
    # Clip TRA to a reasonable bound to avoid extreme unrealistic values.
    eng_raw["setting_3"] = eng_raw["setting_3"].clip(lower=0, upper=100)
    
    # 3. Re-run preprocessing pipeline on the modified raw sequence
    proc_df = preprocess_dataframe(eng_raw)
    
    # 4. Predict the new RUL history curve
    sim_history = predict_engine_history(proc_df, eid)
    return sim_history


# ── Maintenance Timeline ──────────────────────────────────────────────

def _seed_demo_maintenance():
    """Seed a handful of example maintenance blocks for the demo."""
    if scheduled_maintenance:
        return

    # Pick a few critical/warning engines
    interesting = [e for e in fleet_data if e["rul"] < 60][:5]
    types = ["Inspection", "Repair", "Overhaul"]
    for i, eng in enumerate(interesting):
        eid = eng["engine_id"]
        cycles = eng["cycles"]
        # Place maintenance before the predicted failure
        end_c = max(10, cycles - int(eng["rul"]) + random.randint(-5, 5))
        start_c = max(1, end_c - random.randint(5, 15))
        schedule_maintenance(
            engine_id=eid,
            start_cycle=start_c,
            end_cycle=end_c,
            mtype=types[i % len(types)],
            notes=f"Auto-scheduled {types[i % len(types)].lower()} for engine {eid}",
        )

    print(f"   Maintenance blocks seeded: {len(scheduled_maintenance)}")


def get_timeline() -> list[dict]:
    """
    Build timeline data for the Gantt chart.
    Returns one entry per engine with lifecycle bars + maintenance overlays.
    """
    timeline = []
    for eng in fleet_data:
        eid = eng["engine_id"]
        cycles = eng["cycles"]
        rul = eng["rul"]
        failure_cycle = cycles + int(rul)  # predicted failure point
        maint_blocks = [m for m in scheduled_maintenance if m["engine_id"] == eid]
        timeline.append({
            "engine_id": eid,
            "dataset": eng["dataset"],
            "current_cycle": cycles,
            "predicted_failure_cycle": failure_cycle,
            "rul": rul,
            "health_status": eng["health_status"],
            "maintenance": maint_blocks,
        })
    return timeline


def schedule_maintenance(engine_id: str, start_cycle: int, end_cycle: int, mtype: str, notes: str = "") -> dict:
    """Create a new maintenance block."""
    global _maint_id_counter
    # Validate engine exists
    if engine_id not in engine_details:
        raise ValueError(f"Engine {engine_id} not found")
    if end_cycle <= start_cycle:
        raise ValueError("end_cycle must be greater than start_cycle")

    block_id = _next_numeric_id(MONGODB_COLLECTION_MAINTENANCE, "id", _maint_id_counter)
    get_collection(MONGODB_COLLECTION_MAINTENANCE).insert_one(
        {
            "id": block_id,
            "engine_id": str(engine_id),
            "start_cycle": int(start_cycle),
            "end_cycle": int(end_cycle),
            "type": str(mtype),
            "notes": str(notes),
            "created_at": datetime.now().isoformat(),
        }
    )

    _maint_id_counter = max(_maint_id_counter, block_id)
    block = {
        "id": block_id,
        "engine_id": engine_id,
        "start_cycle": start_cycle,
        "end_cycle": end_cycle,
        "type": mtype,
        "notes": notes,
    }
    scheduled_maintenance.append(block)
    return block


def delete_maintenance(block_id: int) -> bool:
    """Remove a maintenance block by ID."""
    global scheduled_maintenance
    before = len(scheduled_maintenance)
    scheduled_maintenance = [m for m in scheduled_maintenance if m["id"] != block_id]
    deleted = len(scheduled_maintenance) < before
    get_collection(MONGODB_COLLECTION_MAINTENANCE).delete_one({"id": int(block_id)})
    return deleted


# ── Interactive Features ──────────────────────────────────────────────

def get_watchlist() -> set[str]:
    return _watchlist


def toggle_watchlist(engine_id: str) -> bool:
    """Toggle an engine in the watchlist. Returns True if now watched."""
    if engine_id in _watchlist:
        _watchlist.discard(engine_id)
        get_collection(MONGODB_COLLECTION_WATCHLIST).delete_one({"engine_id": str(engine_id)})
        return False
    _watchlist.add(engine_id)
    get_collection(MONGODB_COLLECTION_WATCHLIST).update_one(
        {"engine_id": str(engine_id)},
        {"$setOnInsert": {"created_at": datetime.now().isoformat()}},
        upsert=True,
    )
    return True


def get_engine_notes(engine_id: str) -> list[dict]:
    return _engine_notes.get(engine_id, [])


def add_engine_note(engine_id: str, text: str) -> dict:
    global _note_id_counter
    ts = datetime.now().isoformat()
    note_id = _next_numeric_id(MONGODB_COLLECTION_NOTES, "id", _note_id_counter)
    get_collection(MONGODB_COLLECTION_NOTES).insert_one(
        {
            "id": note_id,
            "engine_id": str(engine_id),
            "text": str(text),
            "created_at": ts,
        }
    )

    _note_id_counter = max(_note_id_counter, note_id)
    note = {
        "id": note_id,
        "text": text,
        "timestamp": ts,
    }
    _engine_notes.setdefault(engine_id, []).insert(0, note)
    return note


def delete_engine_note(engine_id: str, note_id: int) -> bool:
    notes = _engine_notes.get(engine_id, [])
    before = len(notes)
    _engine_notes[engine_id] = [n for n in notes if n["id"] != note_id]
    deleted = len(_engine_notes[engine_id]) < before
    get_collection(MONGODB_COLLECTION_NOTES).delete_one({"engine_id": str(engine_id), "id": int(note_id)})
    return deleted


def create_custom_alert(engine_id: str, severity: str, message: str) -> dict:
    alert_id = _next_custom_alert_id()
    ts = datetime.now().isoformat()
    get_collection(MONGODB_COLLECTION_ALERTS).insert_one(
        {
            "alert_id": int(alert_id),
            "engine_id": str(engine_id),
            "severity": str(severity),
            "message": str(message),
            "timestamp": ts,
            "acknowledged": False,
        }
    )

    alert = {
        "id": alert_id,
        "engine_id": engine_id,
        "severity": severity,
        "message": message,
        "timestamp": ts,
        "acknowledged": False,
        "custom": True,
    }
    alerts.insert(0, alert)
    return alert


def bulk_acknowledge_alerts(alert_ids: list[int]) -> int:
    count = 0
    for a in alerts:
        if a["id"] in alert_ids and not a["acknowledged"]:
            a["acknowledged"] = True
            count += 1

    if alert_ids:
        now = datetime.now().isoformat()
        ack_coll = get_collection(MONGODB_COLLECTION_ALERT_ACK)
        alerts_coll = get_collection(MONGODB_COLLECTION_ALERTS)
        for aid in alert_ids:
            ack_coll.update_one(
                {"alert_id": int(aid)},
                {"$set": {"acknowledged": True, "updated_at": now}},
                upsert=True,
            )
        alerts_coll.update_many(
            {"alert_id": {"$in": [int(a) for a in alert_ids]}},
            {"$set": {"acknowledged": True}},
        )
    return count


def get_fleet_export() -> list[dict]:
    """Return fleet data in a flat format suitable for CSV export."""
    return [
        {
            "engine_id": e["engine_id"],
            "dataset": e["dataset"],
            "rul": round(e["rul"], 2),
            "health_status": e["health_status"],
            "cycles": e["cycles"],
            "confidence_std": round(e.get("confidence_std", 0), 2),
            "watched": e["engine_id"] in _watchlist,
        }
        for e in fleet_data
    ]
