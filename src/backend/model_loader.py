"""
Model loader & inference engine.

Loads the V2 ensemble (5 snapshots + best model), scalers, and config.
Provides predict_ensemble_tta() for full inference pipeline, plus an
attention sub-model to extract temporal attention weights.
"""
import os
import numpy as np
import pandas as pd
import joblib
import tensorflow as tf

from backend.custom_layers import CUSTOM_OBJECTS
from backend.config import MODELS_DIR, DATA_DIR, SETTINGS_COLS, SENSOR_COLS

# ── Global state ──────────────────────────────────────────────────────
models: list = []
attention_model = None  # sub-model for alpha weights
config_data: dict = {}
feature_scaler = None
cond_scalers = None
km_model = None

# Unpacked from config.pkl after load
feature_cols: list = []
active_sensors: list = []
key_sensors: list = []
SEQ_LEN: int = 50
RUL_CAP: int = 125
TTA_ROUNDS: int = 10
TTA_NOISE: float = 0.015


def load_all():
    """Load all models, scalers, and config.  Called once at startup."""
    global models, attention_model, config_data
    global feature_scaler, cond_scalers, km_model
    global feature_cols, active_sensors, key_sensors
    global SEQ_LEN, RUL_CAP, TTA_ROUNDS, TTA_NOISE

    # ── Config ─────────────────────────────────────────────────────
    config_data = joblib.load(os.path.join(MODELS_DIR, "config.pkl"))
    feature_cols = config_data["feature_cols"]
    active_sensors = config_data["active_sensors"]
    key_sensors = config_data["key_sensors"]
    SEQ_LEN = config_data["seq_len"]
    RUL_CAP = config_data["rul_cap"]
    TTA_ROUNDS = config_data.get("tta_rounds", 10)
    TTA_NOISE = config_data.get("tta_noise", 0.015)

    # ── Scalers ────────────────────────────────────────────────────
    feature_scaler = joblib.load(os.path.join(MODELS_DIR, "feature_scaler.pkl"))
    cond_scalers = joblib.load(os.path.join(MODELS_DIR, "condition_scalers.pkl"))
    km_model = joblib.load(os.path.join(MODELS_DIR, "kmeans_op_conditions.pkl"))

    # ── Ensemble models ────────────────────────────────────────────
    models.clear()
    for i in range(5):
        path = os.path.join(MODELS_DIR, f"snapshot_{i}.keras")
        if os.path.exists(path):
            m = _load_model_safe(path)
            if m is not None:
                models.append(m)
                print(f"  Loaded snapshot_{i}.keras")

    best_path = os.path.join(MODELS_DIR, "rul_best_model.keras")
    if os.path.exists(best_path):
        best = _load_model_safe(best_path)
        if best is not None:
            models.append(best)
            print("  Loaded rul_best_model.keras")

    print(f"\n✅  {len(models)} models loaded for ensemble")
    print(f"   Features: {len(feature_cols)}  |  Seq len: {SEQ_LEN}  |  RUL cap: {RUL_CAP}")

    # ── Attention sub-model ────────────────────────────────────────
    # Build a model that outputs the alpha weights from TemporalAttentionPooling
    _build_attention_model()


def _load_model_safe(path: str):
    """Load a Keras model, compatible with both Keras 2.x and 3.x."""
    try:
        # Try Keras 3.x approach (safe_mode=False needed for custom layers)
        return tf.keras.models.load_model(
            path, custom_objects=CUSTOM_OBJECTS, safe_mode=False
        )
    except TypeError:
        # Keras 2.x doesn't have safe_mode parameter
        return tf.keras.models.load_model(path, custom_objects=CUSTOM_OBJECTS)
    except Exception as e:
        print(f"  ⚠  Failed to load {path}: {e}")
        import traceback
        traceback.print_exc()
        return None


def _build_attention_model():
    """
    Construct a sub-model from the best (last) model that outputs the
    temporal attention alpha weights alongside the normal outputs.
    """
    global attention_model
    if not models:
        return

    base = models[-1]  # best model
    # Find the TemporalAttentionPooling layer
    tap_layer = None
    for layer in base.layers:
        if isinstance(layer, CUSTOM_OBJECTS.get("TemporalAttentionPooling", type(None))):
            tap_layer = layer
            break
        if layer.__class__.__name__ == "TemporalAttentionPooling":
            tap_layer = layer
            break

    if tap_layer is None:
        print("⚠  TemporalAttentionPooling layer not found — attention viz disabled")
        return

    # The layer outputs (context, alpha). We need to get both outputs.
    # Build sub-model: same input → [normal_outputs..., alpha_weights]
    try:
        # Get the output node of the TAP layer
        # In functional API, layer output is a tuple (context, alpha)
        tap_output = tap_layer.output  # this is (context, alpha)
        if isinstance(tap_output, (list, tuple)):
            alpha_output = tap_output[1]  # the alpha weights
        else:
            alpha_output = tap_output

        attention_model = tf.keras.Model(
            inputs=base.input,
            outputs=base.output + [alpha_output] if isinstance(base.output, list) else [base.output, alpha_output],
        )
        print("✅  Attention sub-model built")
    except Exception as e:
        print(f"⚠  Could not build attention sub-model: {e}")
        attention_model = None


# ── Preprocessing ─────────────────────────────────────────────────────

def preprocess_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the full V2 preprocessing pipeline to a raw C-MAPSS dataframe.
    1. Op-cond clustering (KMeans)
    2. Per-cluster StandardScaler normalization
    3. Feature engineering (12 features per key sensor)
    4. Global MinMaxScaler
    """
    df = df.copy()

    # Ensure sensor columns are float64 (pandas 3.x won't silently cast int→float)
    df[SENSOR_COLS] = df[SENSOR_COLS].astype(np.float64)

    # Step 1: Operating-condition normalization
    df["op_cond"] = km_model.predict(df[SETTINGS_COLS].round(4).values)
    for cond in sorted(df["op_cond"].unique()):
        mask = df["op_cond"] == cond
        if cond in cond_scalers:
            df.loc[mask, SENSOR_COLS] = cond_scalers[cond].transform(
                df.loc[mask, SENSOR_COLS].values
            )

    # Step 2: Feature engineering (build efficiently with pd.concat to avoid fragmentation)
    grp = ["engine_id"]
    new_features = {}
    for s in key_sensors:
        g = df.groupby(grp)[s]
        new_features[f"{s}_rmean5"] = g.transform(lambda x: x.rolling(5, min_periods=1).mean())
        new_features[f"{s}_rmean10"] = g.transform(lambda x: x.rolling(10, min_periods=1).mean())
        new_features[f"{s}_rmean20"] = g.transform(lambda x: x.rolling(20, min_periods=1).mean())
        new_features[f"{s}_rmean30"] = g.transform(lambda x: x.rolling(30, min_periods=1).mean())
        new_features[f"{s}_rstd10"] = g.transform(lambda x: x.rolling(10, min_periods=1).std()).fillna(0)
        new_features[f"{s}_ewm10"] = g.transform(lambda x: x.ewm(span=10, min_periods=1).mean())
        new_features[f"{s}_diff"] = g.transform(lambda x: x.diff()).fillna(0)
        new_features[f"{s}_diff2"] = g.transform(lambda x: x.diff().diff()).fillna(0)
        new_features[f"{s}_cumdeg"] = g.transform(lambda x: x.diff().fillna(0).cumsum())
        new_features[f"{s}_rmin10"] = g.transform(lambda x: x.rolling(10, min_periods=1).min())
        new_features[f"{s}_rmax10"] = g.transform(lambda x: x.rolling(10, min_periods=1).max())
        new_features[f"{s}_deviation"] = new_features[f"{s}_rmean5"] - new_features[f"{s}_rmean30"]
    
    # Concatenate all features at once to avoid fragmentation
    df = pd.concat([df, pd.DataFrame(new_features, index=df.index)], axis=1)
    
    # Defragment dataframe for better memory layout
    df = df.copy()

    # Step 3: Global scaling (transform in chunks if needed to manage memory)
    try:
        df[feature_cols] = feature_scaler.transform(df[feature_cols].values)
    except (MemoryError, ValueError) as e:
        # If memory error, transform in chunks of 1000 rows at a time
        if "Unable to allocate" in str(e) or "memory" in str(e).lower():
            print("⚠  Memory pressure detected during scaling, using chunked transformation...")
            chunk_size = 1000
            for i in range(0, len(df), chunk_size):
                end_idx = min(i + chunk_size, len(df))
                df.iloc[i:end_idx, df.columns.get_indexer(feature_cols)] = feature_scaler.transform(
                    df.iloc[i:end_idx][feature_cols].values
                )
        else:
            raise

    return df


def _make_sequence(data: np.ndarray) -> np.ndarray:
    """Create a (SEQ_LEN, n_features) sequence with repeat-padding."""
    n = len(data)
    if n >= SEQ_LEN:
        return data[-SEQ_LEN:]
    pad = np.tile(data[0:1], (SEQ_LEN - n, 1))
    return np.vstack([pad, data])


# ── Prediction ────────────────────────────────────────────────────────

def predict_single_engine(
    engine_data: np.ndarray,
    use_tta: bool = True,
) -> dict:
    """
    Predict RUL for a single engine.

    Parameters
    ----------
    engine_data : array of shape (n_cycles, n_features) — already preprocessed

    Returns
    -------
    dict with keys: rul, health_status, health_probs, confidence_std,
                    attention_weights (if available)
    """
    seq = _make_sequence(engine_data.astype(np.float32))

    # Build TTA batch
    batch = [seq]
    if use_tta:
        for _ in range(TTA_ROUNDS):
            noise = np.random.normal(0, TTA_NOISE, seq.shape).astype(np.float32)
            batch.append(np.clip(seq + noise, 0.0, 1.0))
    batch = np.array(batch)

    # Ensemble predictions
    all_preds = []
    for m in models:
        p, _ = m.predict(batch, verbose=0)
        all_preds.append(p.flatten())

    preds_flat = np.concatenate(all_preds)
    rul_norm = preds_flat.mean()
    rul_real = float(rul_norm * RUL_CAP)
    confidence_std = float(preds_flat.std() * RUL_CAP)

    # Health classification (best model, original sequence only)
    _, health_pred = models[-1].predict(seq[np.newaxis], verbose=0)
    health_class = int(np.argmax(health_pred))
    health_map = {0: "Healthy", 1: "Warning", 2: "Critical"}
    health_probs = [float(p) for p in health_pred.flatten()]

    # Attention weights
    attn_weights = None
    if attention_model is not None:
        try:
            outputs = attention_model.predict(seq[np.newaxis], verbose=0)
            # Last output is alpha: shape (1, SEQ_LEN, 1)
            alpha = outputs[-1]
            attn_weights = alpha.flatten().tolist()
        except Exception:
            pass

    return {
        "rul": round(rul_real, 1),
        "health_status": health_map[health_class],
        "health_probs": health_probs,
        "confidence_std": round(confidence_std, 2),
        "attention_weights": attn_weights,
    }


def predict_all_engines(df: pd.DataFrame, use_tta: bool = True) -> list[dict]:
    """
    Predict RUL for every engine in an already-preprocessed DataFrame.
    Returns a list of result dicts (one per engine).
    """
    results = []
    for eid in sorted(df["engine_id"].unique()):
        eng = df[df["engine_id"] == eid].sort_values("cycle")
        data = eng[feature_cols].values
        res = predict_single_engine(data, use_tta=use_tta)
        res["engine_id"] = int(eid)
        res["cycles"] = len(eng)
        results.append(res)
    return results


def predict_engine_history(df: pd.DataFrame, engine_id: int) -> list[dict]:
    """
    Predict RUL at every cycle of an engine (sliding window).
    Used for the RUL trend chart.
    Returns list of {cycle, rul, health_status, confidence_std}.
    """
    eng = df[df["engine_id"] == engine_id].sort_values("cycle")
    data = eng[feature_cols].values.astype(np.float32)
    cycles = eng["cycle"].values.tolist()
    history = []

    # For efficiency, predict at every 5th cycle + always the last
    step = max(1, len(data) // 30)  # ~30 points on chart
    indices = list(range(0, len(data), step))
    if len(data) - 1 not in indices:
        indices.append(len(data) - 1)

    for idx in indices:
        window_data = data[: idx + 1]
        seq = _make_sequence(window_data)
        # Quick prediction (1 model, no TTA for speed)
        p, hp = models[-1].predict(seq[np.newaxis], verbose=0)
        rul = float(p.flatten()[0] * RUL_CAP)
        health_class = int(np.argmax(hp))
        health_map = {0: "Healthy", 1: "Warning", 2: "Critical"}

        history.append({
            "cycle": int(cycles[idx]),
            "rul": round(rul, 1),
            "health_status": health_map[health_class],
        })

    return history
