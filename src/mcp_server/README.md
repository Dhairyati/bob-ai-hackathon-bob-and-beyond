# RUL Dashboard MCP Server

A minimal [MCP](https://modelcontextprotocol.io) stdio server that exposes the
RUL Dashboard's copilot capabilities as four MCP tools callable by IBM Bob or any
other MCP-compatible AI assistant.

---

## Prerequisites

**The FastAPI backend must be running before you start or use the MCP server.**

Start the backend from the project root:

```bash
# Windows
.venv\Scripts\python -m uvicorn backend.main:app --port 8000

# macOS / Linux
.venv/bin/python -m uvicorn backend.main:app --port 8000
```

The MCP server connects to `http://localhost:8000` by default.  
Override with the `BACKEND_URL` environment variable if your port differs:

```bash
set BACKEND_URL=http://localhost:8001   # Windows
export BACKEND_URL=http://localhost:8001  # macOS / Linux
```

---

## Running the MCP server manually (for testing)

From the **project root** (one level above `mcp_server/`):

```bash
# Windows
.venv\Scripts\python mcp_server/server.py

# macOS / Linux
.venv/bin/python mcp_server/server.py
```

The server communicates over stdio (stdin/stdout).  
It is designed to be spawned by an MCP host (Bob, Claude Desktop, etc.),  
not run interactively in a terminal.

---

## Registering with IBM Bob

Add the following entry to your Bob `mcp.json` (workspace or global):

```json
{
  "mcpServers": {
    "rul-dashboard-copilot": {
      "command": "C:\\Users\\Mtl\\Downloads\\RUL Dashboard\\.venv\\Scripts\\python.exe",
      "args": ["C:\\Users\\Mtl\\Downloads\\RUL Dashboard\\mcp_server\\server.py"],
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

Adjust the absolute paths to match your machine.

---

## Tools exposed

| Tool | Description |
|------|-------------|
| `get_fleet_readiness` | Fleet-wide mission readiness summary (total / ready / at_risk / not_ready / ready_pct) plus per-engine status list |
| `get_engine_readiness(engine_id)` | Readiness status for a single engine — READY / AT_RISK / NOT_READY with margin details |
| `explain_engine(engine_id)` | Natural-language explanation of an engine's readiness, including the top degraded sensors and at-risk subsystems identified by the ML model, plus last service event |
| `get_maintenance_plan` | Prioritised maintenance plan for all non-ready engines, ranked by urgency, with recommended actions (Immediate Overhaul / Priority Inspection / Schedule Inspection) |
| `get_service_history(engine_id)` | Full maintenance service history for a single engine — service date, type, components serviced, technician notes, and cycle count at time of service |

---

## Error handling

If the FastAPI backend is not running when a tool is called, the tool returns a
plain-text error message instead of crashing:

```
ERROR: Could not connect to backend at http://localhost:8000.
Make sure the FastAPI server is running before calling this tool.
```

HTTP errors (404 engine not found, 500 server error) are surfaced as:

```
ERROR 404: Engine 999 not found
```

---

## Dependencies

- `mcp >= 1.9.0` — official Python MCP SDK
- `httpx >= 0.27.0` — async HTTP client

Both are listed in `backend/requirements.txt` and should be installed in the
project's root `.venv`.
