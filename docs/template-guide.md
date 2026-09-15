# Mission Readiness Copilot

**Predictive maintenance and mission-readiness dashboard for aircraft engine
fleets, with a live IBM Bob integration.**
Built for the IBM Bob AI Innovation Hackathon — Problem Statement D1
(Mission Readiness & Predictive Maintenance).

---

## Team — Bob and Beyond

| Role | Name |
|---|---|
| Lead | Dhairyati Pandya |
| Member | Mitul Mistry |
| Member | Dhruv Bhagat |
| Member | Dhvani Ankola |

**Track:** AI

---

## Problem Statement

Military organisations cannot reliably determine whether aircraft engines are
mission-ready. Maintenance runs on fixed calendar schedules regardless of
actual component condition, and sensor data that could predict failures
weeks in advance sits unanalysed — costing an estimated $90B/year and
risking operational readiness when platforms fail unexpectedly. See
[`docs/problem-statement.md`](docs/problem-statement.md) for the full
breakdown.

## Solution

We built a predictive maintenance dashboard that ingests aircraft engine
sensor data (NASA C-MAPSS), predicts remaining useful life using a 6-model
ensemble, classifies each engine's mission readiness against a configurable
mission window, and generates an automated, ranked maintenance plan. IBM Bob
connects to the live system via MCP, letting users ask natural-language
questions about fleet readiness and get answers pulled directly from
real-time model predictions. Full detail in
[`docs/solution-overview.md`](docs/solution-overview.md).

## Key Features

- 6-model ensemble RUL prediction with test-time augmentation and confidence
  intervals (RMSE 13.04, R² 0.90)
- Mission-readiness classification (READY / AT_RISK / NOT_READY) against a
  configurable mission window, with fails-before-mission detection
- Automated, ranked maintenance plan with three-tier action recommendations
- Temporal attention-based explainability with per-engine natural-language
  readiness summaries
- Live IBM Bob MCP integration — Bob queries real-time fleet readiness,
  engine explanations, and maintenance plans via read-only tools

## Tech Stack

- **Languages:** Python, JavaScript
- **Frameworks:** FastAPI, React, Vite
- **IBM Technologies:** IBM Bob, MCP (Model Context Protocol)
- **Database:** MongoDB Atlas
- **Other:** TensorFlow/Keras, D3.js, NASA C-MAPSS dataset

## How to Run

Full instructions in [`docs/setup-guide.md`](docs/setup-guide.md). Quick
version:

```bash
cd src
python start.py
```

Then open `http://localhost:5173`.

## Demo

- **Video:** see [`demo/demo-video-link.txt`](demo/demo-video-link.txt)
- **Live demo:** see [`demo/live-demo-url.txt`](demo/live-demo-url.txt)
- **Screenshots:** [`demo/screenshots/`](demo/screenshots/)

## What We're Most Proud Of

The IBM Bob MCP integration is genuinely live, not simulated — Bob calls our
real FastAPI backend and returns answers computed from our actual 6-model
ensemble RUL predictions and mission-readiness logic, verified end-to-end
including graceful failure handling when the backend is offline. Combined
with the underlying ML pipeline's attention-based explainability and
confidence intervals, this goes beyond a name-dropped integration to a
working, inspectable Bob Copilot over a real predictive-maintenance system.

## Known Limitations

- Service records (maintenance history, technician notes, prior overhauls)
  are not yet ingested — readiness classification currently relies on
  sensor-derived RUL only.
- Failure prediction is at the engine level, not the component/subsystem
  level.
- Explanation text is deterministic (template-based from model outputs), not
  LLM-generated — a deliberate choice for reliability within the hackathon
  timeframe.
- Bob's MCP integration is currently read-only: Bob can query live fleet
  data but cannot take actions (e.g., scheduling maintenance) through the
  tool interface yet.

## Documentation

- [Problem Statement](docs/problem-statement.md)
- [Solution Overview](docs/solution-overview.md)
- [Architecture](docs/architecture.md)
- [Setup Guide](docs/setup-guide.md)

# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net

# Backend server port
PORT=8000

# Mission readiness configuration
MISSION_NEXT_CYCLE=40
MIN_RUL_FOR_MISSION=20

# Used only by the MCP server to reach the running backend
BACKEND_URL=http://localhost:8000

# Frontend CORS origin (must match Vite dev server URL)
CORS_ORIGIN=http://localhost:5173

# Screenshots

1. `01-fleet-dashboard.png` — Fleet Dashboard showing engine cards, RUL
   gauges, and health status across the fleet
2. `02-readiness-dashboard.png` — Mission Readiness view with fleet-wide
   READY/AT_RISK/NOT_READY breakdown
3. `03-engine-detail-explanation.png` — Engine Detail page showing the
   attention weights chart alongside the generated readiness explanation
4. `04-maintenance-plan.png` — Maintenance Plan view with ranked,
   prioritised actions
5. `05-bob-mcp-query.png` — IBM Bob IDE chat showing a live tool call to
   `get_fleet_readiness` with a real answer

# MCP Server — Mission Readiness Copilot

A minimal stdio MCP server that exposes the backend's copilot endpoints as
tools IBM Bob can call directly. It is a thin HTTP relay only — no backend
logic is duplicated here.

## Prerequisites

The FastAPI backend must already be running (see `../../docs/setup-guide.md`).
This server does not start the backend itself.

## Tools Exposed

| Tool | Calls | Returns |
|---|---|---|
| `get_fleet_readiness` | `GET /api/copilot/readiness` | Fleet-wide summary + per-engine readiness list |
| `get_engine_readiness(engine_id)` | `GET /api/copilot/explain/{id}` | Readiness status for one engine |
| `explain_engine(engine_id)` | `GET /api/copilot/explain/{id}` | Natural-language explanation + top degrading sensors |
| `get_maintenance_plan` | `GET /api/copilot/maintenance-plan` | Ranked, prioritised maintenance actions |

All tools are **read-only** — none can write to the database or change
application state.

## Running Manually (for testing)

```bash
# From src/, with the backend already running
.venv\Scripts\python mcp_server\server.py   # Windows
.venv/bin/python mcp_server/server.py       # macOS/Linux
```

No output is expected — the process waits silently on stdin for an MCP host
to connect. This is normal.

## Registering with IBM Bob

Add to `.bob/mcp.json` (workspace scope):

```json
{
  "mcpServers": {
    "rul-dashboard-copilot": {
      "command": "<absolute path to your .venv python executable>",
      "args": ["<absolute path to mcp_server/server.py>"],
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

Restart Bob IDE after saving this file so it picks up the new server.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | Where the FastAPI backend is reachable |

## Error Handling

If the backend is unreachable, every tool returns a clean error string
instead of crashing:

```
ERROR: Could not connect to backend at http://localhost:8000.
Make sure the FastAPI server is running before calling this tool.
``
# MCP Server — Mission Readiness Copilot

A minimal stdio MCP server that exposes the backend's copilot endpoints as
tools IBM Bob can call directly. It is a thin HTTP relay only — no backend
logic is duplicated here.

## Prerequisites

The FastAPI backend must already be running (see `../../docs/setup-guide.md`).
This server does not start the backend itself.

## Tools Exposed

| Tool | Calls | Returns |
|---|---|---|
| `get_fleet_readiness` | `GET /api/copilot/readiness` | Fleet-wide summary + per-engine readiness list |
| `get_engine_readiness(engine_id)` | `GET /api/copilot/explain/{id}` | Readiness status for one engine |
| `explain_engine(engine_id)` | `GET /api/copilot/explain/{id}` | Natural-language explanation + top degrading sensors |
| `get_maintenance_plan` | `GET /api/copilot/maintenance-plan` | Ranked, prioritised maintenance actions |

All tools are **read-only** — none can write to the database or change
application state.

## Running Manually (for testing)

```bash
# From src/, with the backend already running
.venv\Scripts\python mcp_server\server.py   # Windows
.venv/bin/python mcp_server/server.py       # macOS/Linux
```

No output is expected — the process waits silently on stdin for an MCP host
to connect. This is normal.

## Registering with IBM Bob

Add to `.bob/mcp.json` (workspace scope):

```json
{
  "mcpServers": {
    "rul-dashboard-copilot": {
      "command": "<absolute path to your .venv python executable>",
      "args": ["<absolute path to mcp_server/server.py>"],
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

Restart Bob IDE after saving this file so it picks up the new server.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | Where the FastAPI backend is reachable |

## Error Handling

If the backend is unreachable, every tool returns a clean error string
instead of crashing:

```
ERROR: Could not connect to backend at http://localhost:8000.
Make sure the FastAPI server is running before calling this tool.
```