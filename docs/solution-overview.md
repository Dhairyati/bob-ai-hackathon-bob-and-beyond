# Solution Overview

## Core Mechanism

Our system ingests per-engine sensor time-series data (21 sensor channels,
plus 3 operational settings, per engine per cycle), runs it through a trained
deep learning pipeline to predict Remaining Useful Life (RUL) and health
state, and then layers a mission-readiness decision on top of that raw
prediction. The pipeline in order:

1. **Preprocessing** — operational-condition clustering (KMeans), per-cluster
   sensor normalisation, and 12 engineered features per key sensor (rolling
   means, rolling std, cumulative degradation, etc.)
2. **Prediction** — a 6-model ensemble (CNN + BiLSTM + Transformer-style
   attention pooling) with test-time augmentation (10 noisy passes per
   engine) produces both a RUL estimate and a 3-class health classification,
   plus a genuine uncertainty estimate (ensemble standard deviation)
3. **Mission readiness** — RUL and its confidence interval are compared
   against a configurable mission window to classify each engine as READY,
   AT_RISK, or NOT_READY, and to flag whether the engine is predicted to fail
   before the next mission
4. **Prioritised action** — non-ready engines are automatically ranked by
   urgency and assigned a recommended action tier (Immediate Overhaul /
   Priority Inspection / Schedule Inspection)
5. **Explanation** — a natural-language summary is generated per engine from
   the model's own outputs (RUL, health probabilities, top degrading sensors,
   readiness status), so a maintenance officer gets a sentence, not just a
   number
6. **Bob Copilot layer** — IBM Bob connects to the live system via MCP
   (Model Context Protocol), so a user can ask natural-language questions
   ("which engines are not mission-ready?") and get answers computed from the
   same live model outputs shown in the dashboard

## What Makes This Different From Naive Alternatives

A naive predictive-maintenance system stops at "here is a number" — a raw
RUL prediction with no decision layer on top. Ours goes three steps further:
it turns that number into a readiness *decision* (relative to an actual
mission window, not just an arbitrary threshold), it turns the decision into
a *ranked action plan* (not just a flag), and it makes that whole pipeline
*queryable in natural language* through a real, working IBM Bob integration
— rather than a static dashboard that only shows what a developer chose to
display.

Most systems in this space treat explainability as an afterthought. We
surface temporal attention weights (which points in an engine's history the
model actually focused on), sensor-level cumulative degradation trends, and
ensemble-based confidence intervals — all real model internals, not
post-hoc justifications.

## Key Design Decisions

- **Mission window as a first-class concept, not just a RUL threshold.** A
  fixed alert threshold ("RUL < 30 = warning") doesn't answer the question a
  commander actually asks: "will this engine make it through the *next*
  mission?" We modelled the mission window explicitly and derived readiness
  from RUL relative to that window, not from RUL in isolation.
- **Deterministic explanation text over an LLM call, for now.** We chose
  reliable, always-available template-based natural-language summaries
  generated directly from model outputs, rather than depending on an
  external LLM API that could fail or be rate-limited during a live demo.
  This is a documented limitation and an intentional trade-off — see
  `known_limitations` in `submission.yaml`.
- **Bob as a read-only query layer over live state, not a chatbot wrapper.**
  Rather than build a separate chat widget that talks to a generic LLM, we
  connected IBM Bob directly, via MCP, to our actual backend's readiness,
  explanation, and maintenance-plan endpoints — so every answer Bob gives is
  grounded in the same real-time model output the dashboard shows.

## What the User Experience Looks Like

A maintenance officer opens the Mission Readiness dashboard and sees, at a
glance, what fraction of the fleet is mission-ready right now, with any
NOT_READY or AT_RISK engines called out immediately. Clicking into an engine
shows its RUL trend, sensor behaviour, attention-based explainability
charts, and a plain-language readiness explanation. A separate Maintenance
Plan view shows the fleet's non-ready engines ranked by urgency with a
recommended action for each. Independently, the same officer can open IBM
Bob and simply ask "which engines need attention before our next mission?"
and get an answer sourced from the same live data — no need to open the
dashboard at all if a quick answer is all that's needed.