"""Upload & predict routes — single engine, batch, and file upload."""
import io
import numpy as np
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException

from backend.config import COLUMN_NAMES, SENSOR_COLS, SETTINGS_COLS
from backend.model_loader import (
    preprocess_dataframe, predict_all_engines, predict_engine_history,
    key_sensors, feature_cols,
)
from backend.data_simulator import engine_details

router = APIRouter(prefix="/api/predict", tags=["predict"])

# Counter for upload batches so IDs don't collide
_upload_batch = 0


def _store_uploaded_engine_details(raw_df, proc_df, results, batch_label):
    """Build and store engine_details entries for uploaded engines."""
    for res in results:
        eid = res["engine_id"]
        detail_id = f"upload_{batch_label}_{eid}"
        res["detail_id"] = detail_id

        eng_raw = raw_df[raw_df["engine_id"] == eid].sort_values("cycle")
        eng_proc = proc_df[proc_df["engine_id"] == eid].sort_values("cycle")

        sensor_data = {}
        for s in SENSOR_COLS:
            if s in eng_raw.columns:
                sensor_data[s] = eng_raw[s].tolist()

        cumdeg_data = {}
        for s in key_sensors:
            col = f"{s}_cumdeg"
            if col in eng_proc.columns:
                cumdeg_data[s] = eng_proc[col].tolist()

        rolling_data = {}
        for s in key_sensors:
            cols_available = {}
            for suffix in ["_rmean5", "_rmean30", "_deviation"]:
                col = f"{s}{suffix}"
                if col in eng_proc.columns:
                    cols_available[suffix.lstrip("_")] = eng_proc[col].tolist()
            if cols_available:
                rolling_data[s] = cols_available

        # RUL history
        rul_history = []
        try:
            rul_history = predict_engine_history(proc_df, eid)
        except Exception:
            pass

        engine_details[detail_id] = {
            "engine_id": detail_id,
            "dataset": "Uploaded",
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
            "rul_history": rul_history,
            "settings": {
                s: eng_raw[s].tolist() for s in SETTINGS_COLS if s in eng_raw.columns
            },
        }


@router.post("")
async def predict_upload(file: UploadFile = File(...)):
    """
    Upload a C-MAPSS format text/CSV file and get predictions for all engines.
    File should be space-separated with 26 columns (engine_id, cycle, 3 settings, 21 sensors).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    try:
        content = await file.read()
        text = content.decode("utf-8")
        raw_df = pd.read_csv(io.StringIO(text), sep=r"\s+", header=None)

        # Handle varying column counts
        if raw_df.shape[1] >= 26:
            raw_df = raw_df.iloc[:, :26]
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Expected ≥26 columns, got {raw_df.shape[1]}. "
                       "Format: engine_id cycle setting1-3 sensor1-21",
            )

        raw_df.columns = COLUMN_NAMES
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    try:
        proc_df = preprocess_dataframe(raw_df)
        results = predict_all_engines(proc_df, use_tta=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    global _upload_batch
    _upload_batch += 1
    _store_uploaded_engine_details(raw_df, proc_df, results, _upload_batch)

    # Collect the full detail blobs so the frontend can cache them locally
    details_map = {}
    for res in results:
        did = res.get("detail_id")
        if did and did in engine_details:
            details_map[did] = engine_details[did]

    return {
        "filename": file.filename,
        "total_engines": len(results),
        "predictions": results,
        "engine_details": details_map,
    }


@router.post("/batch")
async def predict_batch(files: list[UploadFile] = File(...)):
    """Upload multiple C-MAPSS files and get batch predictions."""
    all_results = []
    for f in files:
        try:
            content = await f.read()
            text = content.decode("utf-8")
            raw_df = pd.read_csv(io.StringIO(text), sep=r"\s+", header=None).iloc[:, :26]
            raw_df.columns = COLUMN_NAMES
            proc_df = preprocess_dataframe(raw_df)
            results = predict_all_engines(proc_df, use_tta=True)

            global _upload_batch
            _upload_batch += 1
            _store_uploaded_engine_details(raw_df, proc_df, results, _upload_batch)

            all_results.append({
                "filename": f.filename,
                "total_engines": len(results),
                "predictions": results,
            })
        except Exception as e:
            all_results.append({"filename": f.filename, "error": str(e)})

    return {"files": all_results}
