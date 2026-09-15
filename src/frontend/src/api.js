const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export async function fetchFleetStatus() {
  const res = await fetch(`${API_BASE}/fleet/status`);
  if (!res.ok) throw new Error('Failed to fetch fleet status');
  return res.json();
}

export async function fetchFleetAnalytics() {
  const res = await fetch(`${API_BASE}/fleet/analytics`);
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
}

export async function fetchEngineDetail(engineId) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/detail`);
  if (!res.ok) throw new Error(`Engine ${engineId} not found`);
  return res.json();
}

export async function fetchEngineHistory(engineId) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/history`);
  if (!res.ok) throw new Error(`History for engine ${engineId} not found`);
  return res.json();
}

export async function fetchAlerts(severity = null, acknowledged = null) {
  const params = new URLSearchParams();
  if (severity) params.set('severity', severity);
  if (acknowledged !== null) params.set('acknowledged', String(acknowledged));
  const res = await fetch(`${API_BASE}/alerts?${params}`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export async function acknowledgeAlert(alertId) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to acknowledge alert');
  return res.json();
}

export async function fetchModelMetrics() {
  const res = await fetch(`${API_BASE}/model/metrics`);
  if (!res.ok) throw new Error('Failed to fetch model metrics');
  return res.json();
}

export async function uploadPredict(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/predict`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Prediction failed');
  }
  return res.json();
}

export async function uploadPredictBatch(files) {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  const res = await fetch(`${API_BASE}/predict/batch`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Batch prediction failed');
  return res.json();
}

export async function simulateWhatIf(engineId, params) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Simulation failed');
  }
  return res.json();
}

export async function fetchTimeline() {
  const res = await fetch(`${API_BASE}/fleet/timeline`);
  if (!res.ok) throw new Error('Failed to fetch timeline');
  return res.json();
}

export async function scheduleMaintenance(data) {
  const res = await fetch(`${API_BASE}/fleet/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to schedule maintenance');
  }
  return res.json();
}

export async function deleteMaintenance(blockId) {
  const res = await fetch(`${API_BASE}/fleet/schedule/${blockId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete maintenance block');
  return res.json();
}

// ── Watchlist ─────────────────────────────────────────────────────────

export async function fetchWatchlist() {
  const res = await fetch(`${API_BASE}/watchlist`);
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

export async function toggleWatchlist(engineId) {
  const res = await fetch(`${API_BASE}/watchlist/${engineId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle watchlist');
  return res.json();
}

// ── Engine Notes ──────────────────────────────────────────────────────

export async function fetchEngineNotes(engineId) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/notes`);
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function addEngineNote(engineId, text) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to add note');
  return res.json();
}

export async function deleteEngineNote(engineId, noteId) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/notes/${noteId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete note');
  return res.json();
}

// ── Custom Alerts ─────────────────────────────────────────────────────

export async function createCustomAlert(engineId, severity, message) {
  const res = await fetch(`${API_BASE}/alerts/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine_id: engineId, severity, message }),
  });
  if (!res.ok) throw new Error('Failed to create alert');
  return res.json();
}

export async function bulkAcknowledgeAlerts(alertIds) {
  const res = await fetch(`${API_BASE}/alerts/bulk-acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alert_ids: alertIds }),
  });
  if (!res.ok) throw new Error('Bulk acknowledge failed');
  return res.json();
}

// ── Fleet Export ──────────────────────────────────────────────────────

export async function fetchFleetExport() {
  const res = await fetch(`${API_BASE}/fleet/export`);
  if (!res.ok) throw new Error('Failed to fetch export data');
  return res.json();
}

// ── Copilot ───────────────────────────────────────────────────────────

export async function getReadiness() {
  const res = await fetch(`${API_BASE}/copilot/readiness`);
  if (!res.ok) throw new Error('Failed to fetch readiness data');
  return res.json();
}

export async function getExplanation(engineId) {
  const res = await fetch(`${API_BASE}/copilot/explain/${engineId}`);
  if (!res.ok) throw new Error(`Failed to fetch explanation for engine ${engineId}`);
  return res.json();
}

export async function getMaintenancePlan() {
  const res = await fetch(`${API_BASE}/copilot/maintenance-plan`);
  if (!res.ok) throw new Error('Failed to fetch maintenance plan');
  return res.json();
}

export async function getServiceHistory(engineId) {
  const res = await fetch(`${API_BASE}/engine/${engineId}/service-history`);
  if (!res.ok) throw new Error(`Failed to fetch service history for engine ${engineId}`);
  return res.json();
}
