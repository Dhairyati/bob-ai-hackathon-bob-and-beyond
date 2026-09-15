# Setup Guide

This guide assumes no prior familiarity with the repository. Follow it
top to bottom on a clean machine.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10–3.12 | Must match the version the `.venv` and TensorFlow build were created with |
| Node.js | 18+ | For the React/Vite frontend |
| MongoDB Atlas account | — | Free tier is sufficient; you need a connection URI |
| IBM Bob (optional, for the Copilot feature) | Latest | Only required if you want to test the MCP/Bob integration; the core dashboard runs without it |

## Environment Variables

Copy `src/.env.example` to `src/.env` and fill in:

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net` |
| `PORT` | Backend port | `8000` |
| `MISSION_NEXT_CYCLE` | Cycles until the next mission window (fixed horizon) | `40` |
| `MIN_RUL_FOR_MISSION` | Minimum RUL required to be considered mission-capable | `20` |
| `BACKEND_URL` | Used only by the MCP server to reach the backend | `http://localhost:8000` |

## Install

From the project root:

```bash
# Backend
cd src/backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

## Run

**Option A — single command (recommended):**

```bash
cd src
python start.py
```

This starts both the FastAPI backend and the Vite dev server as subprocesses.

**Option B — two terminals:**

```bash
# Terminal 1 — backend
cd src/backend
.venv\Scripts\python -m uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd src/frontend
npm run dev
```

The app will be available at `http://localhost:5173` (frontend) with the API
at `http://localhost:8000`.

## Verifying It's Working

1. Open `http://localhost:8000/health` — should return a healthy status.
2. Open `http://localhost:5173` — the Fleet Dashboard should load with
   engine cards populated (first load may take 1–2 minutes while the model
   runs inference across the full fleet and builds the cache).
3. Navigate to **Mission Readiness** in the sidebar — should show a
   populated table with READY/AT_RISK/NOT_READY counts.
4. Navigate to **Maintenance Plan** — should show a ranked list of
   non-ready engines.

## Enabling the IBM Bob / MCP Integration (Optional)

1. Ensure the backend is already running (step above) — the MCP server
   relays to it and does not start it.
2. Manually verify the MCP server starts cleanly:
```bash
   cd src
   .venv\Scripts\python mcp_server/server.py
```
   No output is expected — it waits silently on stdin for an MCP host.
3. Register the server in Bob's MCP configuration at `.bob/mcp.json`
   (workspace scope) — see `mcp_server/README.md` for the exact
   configuration snippet and paths.
4. Restart/reload Bob IDE so it picks up the new server.
5. In Bob's chat, ask: *"Which engines in this fleet are not mission-ready
   right now?"* — Bob should invoke the `get_fleet_readiness` tool and
   respond with live data matching the dashboard.

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: tensorflow.tsl.protobuf` on backend start | TensorFlow/protobuf version mismatch | `pip install "protobuf<5,>=3.20"`, then retry; if unresolved, reinstall the exact TensorFlow version pinned in `requirements.txt` (do not upgrade — the `.keras` models were trained against a specific version) |
| Fleet Dashboard loads with no engines | `data/` folder missing C-MAPSS files, or MongoDB connection failed | Confirm `test_FD001.txt`–`test_FD004.txt` exist under `src/backend/data/`; check `MONGODB_URI` is correct and the Atlas cluster allows your IP |
| First load is very slow (2+ minutes) | Model inference runs across the full fleet on first startup and builds a disk cache | Expected on first run only; subsequent restarts use the cache unless data files change |
| MCP server shows no output when run manually | This is normal — it's a stdio server waiting for a host | Confirm it doesn't exit immediately; if it exits, check the traceback for import errors |
| Bob doesn't seem to call any tool for a readiness question | MCP server not registered, or Bob not reloaded after config change | Re-check `.bob/mcp.json` paths point to the correct `.venv` Python and `server.py` location, then fully restart Bob IDE |
| `ERROR: Could not connect to backend` from an MCP tool | FastAPI backend is not running | Start the backend first (`python start.py` or the two-terminal option above) before querying Bob |

## Known Limitations

See `submission.yaml` → `known_limitations` for the current, honest list of
gaps (service records, component-level prediction, and the read-only scope
of the current Bob/MCP integration).