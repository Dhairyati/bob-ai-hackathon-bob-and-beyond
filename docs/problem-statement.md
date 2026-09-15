# Problem Statement

## The Problem

Military organisations cannot reliably determine whether aircraft engines are
mission-ready at any given moment. Maintenance is scheduled on fixed calendar
intervals — every N flight hours or every N months — regardless of the actual
physical condition of the engine. An engine flagged as "due for maintenance"
next month might already be degrading rapidly; an engine not due for another
six months might be perfectly healthy the whole time. Neither case is caught
by a calendar.

Meanwhile, modern aircraft engines are already instrumented with dozens of
sensors — temperature, pressure, fan speed, and more — continuously recording
operational data throughout every flight. This sensor data contains early
signatures of component degradation weeks before a failure would occur. In
practice, this data is logged but rarely analysed in real time, and almost
never turned into an actionable, fleet-wide readiness picture.

## Who Is Affected

- **Maintenance officers and readiness commanders**, who need to know today —
  not after the next scheduled inspection — which engines in their fleet can
  safely support an upcoming mission.
- **Maintenance crews**, who currently plan work manually, often without a
  clear, data-driven sense of which engines are the most urgent to service
  first.
- **Mission planners**, who need to know in advance if a scheduled mission is
  at risk because of equipment condition, not just availability.

## Why Existing Approaches Fall Short

Calendar-based maintenance is simple to schedule but blind to actual
condition — it either wastes maintenance effort on healthy engines or misses
engines that are degrading faster than expected. Even where sensor data is
collected, it typically sits in raw form, unanalysed, because turning
thousands of raw sensor readings per engine into a single readiness decision
requires machine learning infrastructure most maintenance teams do not have
readily accessible in an operational, day-to-day tool.

## Quantified Cost

The problem statement provided by the hackathon organisers cites that the US
military spends approximately $90B per year on maintenance, and that shifting
from calendar-based to predictive approaches could save billions annually.
Beyond direct cost, when platforms fail unexpectedly, operational readiness
drops immediately and recovery can take weeks — a cost that is operational and
strategic, not just financial.

## Why Now

Sensor data and machine learning inference are both mature enough today that
a working predictive-maintenance system is achievable within days, not years
— the gap is not technical capability but integration: connecting existing
sensor data streams to a model, and connecting that model's output to a
decision-ready readiness view that a maintenance officer can act on
immediately, ideally through a natural-language interface rather than a raw
dashboard alone.

## Our Focus

We address the aircraft-engine case directly (D1: Mission Readiness &
Predictive Maintenance), using the publicly available NASA C-MAPSS turbofan
degradation dataset as a realistic stand-in for real HUMS (Health & Usage
Monitoring System) sensor data, since it captures the same core problem:
per-engine sensor time series that must be turned into a readiness decision
before the next mission.