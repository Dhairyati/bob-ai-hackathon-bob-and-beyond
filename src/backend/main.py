"""
C-MAPSS RUL Prediction Dashboard — FastAPI Backend

Loads V2 ensemble models on startup, preprocesses C-MAPSS data,
and serves prediction + fleet monitoring endpoints.
Serves the built React frontend as static files — single server deployment.
"""
import sys
import os
from pathlib import Path

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import CORS_ORIGINS
from backend.database import init_db

# Path to the built frontend
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# ── Lifespan: load models + fleet data on startup ────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀  Starting C-MAPSS RUL Dashboard Backend...")

    # Initialize persistent storage for interactive features.
    init_db()

    # Load models (heavy — TensorFlow init)
    print("\n📦  Loading models & scalers...")
    try:
        from backend import model_loader
        model_loader.load_all()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"⚠  Model loading failed: {e}")
        print("   Dashboard will use synthetic demo data.")

    # Load fleet data (runs predictions)
    print("\n📊  Building fleet state...")
    try:
        from backend import data_simulator
        data_simulator.load_fleet_data()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"⚠  Fleet data loading failed: {e}")
        print("   Generating synthetic fallback data...")
        from backend import data_simulator
        data_simulator._generate_synthetic_fleet()

    print("\n✅  Backend ready!")
    yield
    print("\n👋  Shutting down...")


# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="C-MAPSS RUL Prediction Dashboard",
    description="Predictive maintenance API powered by CNN+BiLSTM+Transformer V2 model",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ─────────────────────────────────────────────────

from backend.routes.fleet import router as fleet_router
from backend.routes.engine import router as engine_router
from backend.routes.alerts import router as alerts_router
from backend.routes.predict import router as predict_router
from backend.routes.model_metrics import router as model_metrics_router
from backend.routes.interactions import router as interactions_router
from backend.routes.db_status import router as db_status_router
from backend.routes.copilot import router as copilot_router
from backend.routes.service_records import router as service_records_router

app.include_router(fleet_router)
app.include_router(engine_router)
app.include_router(alerts_router)
app.include_router(predict_router)
app.include_router(model_metrics_router)
app.include_router(interactions_router)
app.include_router(db_status_router)
app.include_router(copilot_router)
app.include_router(service_records_router)


@app.get("/health")
async def health():
    from backend import model_loader
    from backend import data_simulator
    return {
        "status": "ok",
        "models_loaded": len(model_loader.models),
        "fleet_size": len(data_simulator.fleet_data),
        "alerts_count": len(data_simulator.alerts),
    }


# ── Serve React frontend ─────────────────────────────────────────────

if FRONTEND_DIR.is_dir():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static-assets")

    # Catch-all: serve index.html for any non-API route (SPA client-side routing)
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # If the exact file exists in dist/, serve it (e.g. favicon.ico)
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(FRONTEND_DIR / "index.html")
