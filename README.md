# =============================================================================
# HACKATHON SUBMISSION METADATA
# =============================================================================
# Instructions:
#   - Fill in ALL required fields (marked with # REQUIRED)
#   - Optional fields can be left as empty strings ""
#   - Do NOT rename this file — the evaluation pipeline reads it by name
#   - Use double quotes around all string values
# =============================================================================

team:
  name: "Bob and Beyond"
  track: "AI"
  lead:
    name: "Dhairyati Pandya"
    email: "23cs052@charusat.edu.in"
  members:
    - name: "Mitul Mistry"
      email: "23cs045@charusat.edu.in"
    - name: "Dhruv Bhagat"
      email: "23cs005@charusat.edu.in"
    - name: "Dhvani Ankola"
      email: "23it003@charusat.edu.in"

submission:
  title: "Mission Readiness Copilot"

  problem_statement: >
    Military organisations cannot reliably determine whether aircraft engines
    are mission-ready. Maintenance runs on fixed calendar schedules regardless
    of actual component condition, and sensor data that could predict failures
    weeks in advance sits unanalysed — costing the US military an estimated
    $90B/year and risking operational readiness when platforms fail unexpectedly.

  solution_summary: >
    We built a predictive maintenance dashboard that ingests aircraft engine
    sensor data (NASA C-MAPSS), predicts remaining useful life using a
    6-model ensemble with test-time augmentation, classifies each engine's
    mission readiness (READY / AT_RISK / NOT_READY) against a configurable
    mission window, and generates an automated, ranked maintenance plan.
    IBM Bob connects to the live system via MCP, letting engineers ask
    natural-language questions about fleet readiness and get answers pulled
    directly from real-time model predictions.

  key_features:
    - "6-model ensemble RUL prediction with test-time augmentation and confidence intervals (RMSE 13.04, R² 0.90)"
    - "Mission-readiness classification (READY/AT_RISK/NOT_READY) against a configurable mission window, with fails-before-mission detection"
    - "Automated, ranked maintenance plan with three-tier action recommendations (Immediate Overhaul / Priority Inspection / Schedule Inspection)"
    - "Temporal attention-based explainability with per-engine natural-language readiness summaries"
    - "Live IBM Bob MCP integration — Bob queries real-time fleet readiness, engine explanations, and maintenance plans via read-only tools"

  tech_stack:
    languages: ["Python", "JavaScript"]
    frameworks: ["FastAPI", "React", "Vite"]
    ibm_technologies: ["IBM Bob", "MCP (Model Context Protocol)"]
    databases: ["MongoDB Atlas"]
    other: ["TensorFlow/Keras", "D3.js", "NASA C-MAPSS dataset"]

  what_we_are_most_proud_of: >
    The IBM Bob MCP integration is genuinely live, not simulated — Bob calls
    our real FastAPI backend and returns answers computed from our actual
    6-model ensemble RUL predictions and mission-readiness logic, verified
    end-to-end including graceful failure handling when the backend is offline.
    Combined with the underlying ML pipeline's attention-based explainability
    and confidence intervals, this goes beyond a name-dropped integration to
    a working, inspectable Bob Copilot over a real predictive-maintenance system.

  known_limitations: >
    Service records (maintenance history, technician notes, prior overhauls)
    are not yet ingested — readiness classification currently relies on
    sensor-derived RUL only. Failure prediction is at the engine level, not
    the component/subsystem level. Explanation text is deterministic
    (template-based from model outputs), not LLM-generated — a deliberate
    choice for reliability within the hackathon timeframe. Bob's MCP
    integration is currently read-only: Bob can query live fleet data but
    cannot take actions (e.g., scheduling maintenance) through the tool
    interface yet.

# =============================================================================
# ARTIFACT LOCATIONS
# These paths are relative to the repo root. Only change if you moved files.
# =============================================================================
artifacts:
  source_code: "src/"
  setup_guide: "docs/setup-guide.md"
  architecture_doc: "docs/architecture.md"
  demo_video: "demo/demo-video-link.txt"
  live_demo: "demo/live-demo-url.txt"
  screenshots: "demo/screenshots/"
  presentation: "presentation/"