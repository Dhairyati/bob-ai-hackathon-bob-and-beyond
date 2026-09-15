# ✈️ Mission Readiness Copilot

> **AI-powered predictive maintenance and mission-readiness intelligence for aircraft engines**

**Team:** Bob and Beyond
**Track:** AI

---

## 🎯 Problem Statement

Military organisations cannot reliably determine whether aircraft engines are truly **mission-ready**.

Traditional maintenance often relies on fixed calendar-based schedules rather than the actual condition of engine components. Meanwhile, valuable sensor data capable of predicting failures **weeks in advance** often remains underutilised.

This creates two major problems:

* 💰 **Unnecessary maintenance costs** from servicing healthy engines
* ⚠️ **Operational readiness risks** when engines fail unexpectedly

Our goal is to transform raw aircraft sensor data into **actionable mission-readiness intelligence**.

---

## 💡 Our Solution

**Mission Readiness Copilot** is an AI-powered predictive maintenance platform that analyses aircraft engine sensor data and determines whether each engine is ready for an upcoming mission.

The platform:

1. 📊 Ingests aircraft engine sensor data from the **NASA C-MAPSS dataset**
2. 🧠 Predicts **Remaining Useful Life (RUL)** using a six-model ensemble
3. 🎯 Applies **test-time augmentation** to improve prediction robustness
4. 📈 Generates **confidence intervals** around RUL predictions
5. 🛫 Classifies engines as:

   * 🟢 **READY**
   * 🟡 **AT_RISK**
   * 🔴 **NOT_READY**
6. ⏱️ Detects whether an engine is likely to fail **before the configured mission window**
7. 🔧 Automatically generates a **ranked maintenance plan**
8. 🔍 Provides **attention-based explainability** for individual predictions
9. 🤖 Connects **IBM Bob** directly to the live system through **MCP**
10. 💬 Allows engineers to query real-time fleet intelligence using natural language

---

## 🚀 Key Features

### 1. 🧠 Ensemble RUL Prediction

A six-model ensemble predicts the **Remaining Useful Life** of each engine.

**Model performance:**

* **RMSE:** 13.04
* **R²:** 0.90
* Test-time augmentation
* Confidence intervals for prediction uncertainty

---

### 2. 🛫 Mission-Readiness Classification

RUL predictions are translated into an operational readiness status based on a **configurable mission window**.

| Status           | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| 🟢 **READY**     | Engine has sufficient predicted remaining life for the mission   |
| 🟡 **AT_RISK**   | Engine may complete the mission but has limited remaining margin |
| 🔴 **NOT_READY** | Engine is predicted to fail before or within the mission window  |

The system also performs **fails-before-mission detection**, allowing engineers to identify critical engines before deployment.

---

### 3. 🔧 Automated Maintenance Planning

The system automatically ranks engines according to operational risk and recommends the appropriate maintenance action.

| Priority    | Recommended Action      |
| ----------- | ----------------------- |
| 🔴 Critical | **Immediate Overhaul**  |
| 🟠 High     | **Priority Inspection** |
| 🟡 Medium   | **Schedule Inspection** |

This converts predictive analytics into an actionable maintenance workflow.

---

### 4. 🔍 Explainable AI

The platform uses **temporal attention-based explainability** to identify important portions of an engine's sensor history contributing to its prediction.

Each engine also receives a **natural-language readiness summary**, making model outputs easier for maintenance personnel to interpret.

---

### 5. 🤖 IBM Bob + MCP Integration

IBM Bob is connected directly to the live predictive-maintenance system using the **Model Context Protocol (MCP)**.

Engineers can ask Bob questions such as:

> *"Which engines are not ready for the next mission?"*

> *"Why is Engine 42 at risk?"*

> *"What maintenance actions are currently recommended?"*

Bob retrieves information from the **live FastAPI backend**, including:

* Fleet readiness
* Engine-level predictions
* Readiness explanations
* Maintenance recommendations

The integration is **read-only** and uses actual model predictions rather than simulated responses.

---

## 🏆 What We're Most Proud Of

### A genuinely live IBM Bob integration

Our IBM Bob integration is **not simulated or hard-coded**.

Bob communicates with our actual FastAPI backend through MCP and retrieves results generated from our **live six-model ensemble and mission-readiness pipeline**.

The complete flow works end-to-end:

```text
                    ┌──────────────────┐
                    │    IBM Bob       │
                    │  Natural Language│
                    └────────┬─────────┘
                             │
                             │ MCP
                             ▼
                    ┌──────────────────┐
                    │   FastAPI API    │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
      ┌────────────────┐          ┌──────────────────┐
      │  RUL Ensemble  │          │ Readiness Engine │
      │   6 Models     │          │ READY / AT RISK │
      └────────┬───────┘          └────────┬─────────┘
               │                           │
               └─────────────┬─────────────┘
                             ▼
                    ┌──────────────────┐
                    │ Maintenance Plan │
                    └──────────────────┘
```

We also implemented **graceful failure handling** so the system responds appropriately when the backend is unavailable.

This makes IBM Bob a functional **Copilot layer over a real predictive-maintenance system**, rather than simply a named integration.

---

## 🧰 Tech Stack

### Languages

* Python
* JavaScript

### Frontend

* React
* Vite
* D3.js

### Backend

* FastAPI

### Machine Learning

* TensorFlow / Keras
* Six-model ensemble
* Temporal attention
* Test-time augmentation
* RUL prediction
* Confidence estimation

### AI / IBM

* IBM Bob
* Model Context Protocol (MCP)

### Database

* MongoDB Atlas

### Dataset

* NASA C-MAPSS

---

## 🏗️ System Architecture

```text
NASA C-MAPSS Sensor Data
          │
          ▼
┌───────────────────────┐
│ Data Preprocessing    │
│ & Feature Engineering │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 6-Model RUL Ensemble  │
│ + Test-Time Augment.  │
└───────────┬───────────┘
            │
            ▼
┌────────────────────────┐
│ RUL + Confidence       │
│ Interval + Attention   │
└────────────┬───────────┘
             │
             ▼
┌────────────────────────┐
│ Mission Readiness      │
│ Classification         │
└────────────┬───────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
   Readiness    Maintenance
    Status         Plan
       │           │
       └─────┬─────┘
             ▼
       ┌────────────┐
       │ FastAPI    │
       │ Backend    │
       └─────┬──────┘
             │
       ┌─────┴──────┐
       ▼            ▼
    React UI     IBM Bob
                  via MCP
```

---

## ⚠️ Known Limitations

The current prototype has several limitations that we plan to address in future iterations.

### Maintenance History

Service records such as:

* Previous maintenance
* Technician notes
* Component replacements
* Prior overhauls

are not currently integrated.

Readiness classification therefore relies primarily on **sensor-derived RUL**.

### Engine-Level Prediction

Predictions are currently performed at the **engine level**, rather than at individual component or subsystem level.

### Explanation Generation

Readiness explanations are currently **deterministic and template-based**, using model outputs rather than LLM-generated explanations.

This was a deliberate design decision to prioritise **reliability and consistency** within the hackathon timeframe.

### Read-Only MCP Integration

IBM Bob can currently **query** live fleet information but cannot execute operational actions through MCP.

For example, Bob cannot yet:

* Schedule maintenance
* Assign technicians
* Update maintenance records
* Trigger an overhaul

---

## 🔮 Future Scope

Potential next steps include:

* Integrating historical maintenance and service records
* Component-level failure prediction
* Real-time sensor streaming
* LLM-powered contextual explanations
* Predictive maintenance scheduling
* Role-based maintenance workflows
* Action-enabled MCP tools
* Integration with real-world fleet management systems
* Continuous model retraining from new operational data

---

## 📂 Repository Structure

```text
├── src/                         # Source code
│
├── docs/
│   ├── setup-guide.md           # Setup instructions
│   └── architecture.md          # System architecture
│
├── demo/
│   ├── demo-video-link.txt      # Demo video
│   ├── live-demo-url.txt        # Live deployment
│   └── screenshots/             # Application screenshots
│
├── presentation/               # Hackathon presentation
│
└── README.md
```

---

## ⚙️ Setup

Detailed setup instructions are available in:

📖 **[`docs/setup-guide.md`](docs/setup-guide.md)**

Architecture details:

🏗️ **[`docs/architecture.md`](docs/architecture.md)**

---

## 🎥 Demo

### Live Demo

🔗 **[`Live Demo`](demo/live-demo-url.txt)**

### Demo Video

🎬 **[`Watch Demo`](demo/demo-video-link.txt)**

### Screenshots

📸 **[`View Screenshots`](demo/screenshots/)**

---

## 👥 Team — Bob and Beyond

| Member               | Role        |
| -------------------- | ----------- |
| **Dhairyati Pandya** | Team Lead   |
| **Mitul Mistry**     | Team Member |
| **Dhruv Bhagat**     | Team Member |
| **Dhvani Ankola**    | Team Member |

---

## 📌 Hackathon Submission

**Project:** Mission Readiness Copilot
**Team:** Bob and Beyond
**Track:** AI

> **From sensor data → prediction → readiness → maintenance action — with IBM Bob as the Copilot.** ✈️🤖

---
