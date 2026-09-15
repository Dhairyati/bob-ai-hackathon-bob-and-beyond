import { Bell, Check, CheckCheck, Download, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acknowledgeAlert, bulkAcknowledgeAlerts, createCustomAlert, fetchAlerts, fetchFleetStatus } from '../api';

export default function AlertCenter() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAcked, setShowAcked] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ engine_id: '', severity: 'warning', message: '' });
  const [engines, setEngines] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([fetchAlerts(), fetchFleetStatus()])
      .then(([a, f]) => { setAlerts(a); setEngines(f.engines || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAck = async (id) => {
    try {
      await acknowledgeAlert(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkAck = async () => {
    if (selected.size === 0) return;
    try {
      await bulkAcknowledgeAlerts([...selected]);
      setAlerts(prev => prev.map(a => selected.has(a.id) ? { ...a, acknowledged: true } : a));
      setSelected(new Set());
    } catch (e) { console.error(e); }
  };

  const handleCreateAlert = async () => {
    if (!createForm.engine_id || !createForm.message.trim()) return;
    try {
      const alert = await createCustomAlert(createForm.engine_id, createForm.severity, createForm.message);
      setAlerts(prev => [alert, ...prev]);
      setShowCreateForm(false);
      setCreateForm({ engine_id: '', severity: 'warning', message: '' });
    } catch (e) { console.error(e); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filtered.filter(a => !a.acknowledged).map(a => a.id);
    setSelected(new Set(visibleIds));
  };

  const handleExportAlerts = () => {
    const rows = alerts.map(a =>
      [a.id, a.engine_id, a.severity, a.acknowledged ? 'Yes' : 'No', a.message.replace(/,/g, ';'), a.timestamp].join(',')
    );
    const csv = ['ID,Engine ID,Severity,Acknowledged,Message,Timestamp', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'alerts_export.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner" /><p className="loading-text">Loading alerts…</p></div>;
  }

  let filtered = alerts;
  if (filter !== 'all') filtered = filtered.filter(a => a.severity === filter);
  if (!showAcked) filtered = filtered.filter(a => !a.acknowledged);

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length,
    warning: alerts.filter(a => a.severity === 'warning' && !a.acknowledged).length,
    info: alerts.filter(a => a.severity === 'info' && !a.acknowledged).length,
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Alert Center</h1>
        <p>{alerts.filter(a => !a.acknowledged).length} active alerts across the fleet</p>
      </div>

      {/* Summary cards */}
      <div className="stats-bar" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-critical)' }}>
          <div><div className="stat-value" style={{ color: 'var(--color-critical)' }}>{counts.critical}</div><div className="stat-label">Critical</div></div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-warning)' }}>
          <div><div className="stat-value" style={{ color: 'var(--color-warning)' }}>{counts.warning}</div><div className="stat-label">Warning</div></div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--color-info)' }}>
          <div><div className="stat-value" style={{ color: 'var(--color-info)' }}>{counts.info}</div><div className="stat-label">Info</div></div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="controls-bar" style={{ marginBottom: 20 }}>
        {['all', 'critical', 'warning', 'info'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && counts[f] > 0 && (
              <span style={{
                marginLeft: 6,
                background: f === 'critical' ? 'var(--color-critical)' : f === 'warning' ? 'var(--color-warning)' : 'var(--color-info)',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: '0.68rem',
                fontWeight: 700,
              }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} />
          Show acknowledged
        </label>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <button className="filter-btn active" onClick={handleBulkAck} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCheck size={14} /> Ack Selected ({selected.size})
            </button>
          )}
          <button className="filter-btn" onClick={selectAllVisible} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={14} /> Select All
          </button>
          <button className="filter-btn" onClick={() => setShowCreateForm(!showCreateForm)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Create Alert
          </button>
          <button className="filter-btn" onClick={handleExportAlerts} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Create Alert Form */}
      {showCreateForm && (
        <div className="create-alert-form fade-in" style={{ marginBottom: 20 }}>
          <div className="modal-content" style={{ maxWidth: '100%' }}>
            <div className="modal-header">
              <h3>Create Custom Alert</h3>
              <button className="icon-btn" onClick={() => setShowCreateForm(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 200px' }}>Engine
                <select value={createForm.engine_id} onChange={(e) => setCreateForm(p => ({ ...p, engine_id: e.target.value }))}>
                  <option value="">Select engine…</option>
                  {engines.map(e => <option key={e.engine_id} value={e.engine_id}>Engine {e.engine_id} ({e.health_status})</option>)}
                </select>
              </label>
              <label style={{ flex: '0 0 140px' }}>Severity
                <select value={createForm.severity} onChange={(e) => setCreateForm(p => ({ ...p, severity: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
              <label style={{ flex: '2 1 300px' }}>Message
                <input type="text" value={createForm.message} onChange={(e) => setCreateForm(p => ({ ...p, message: e.target.value }))} placeholder="Alert message…" />
              </label>
            </div>
            <div className="modal-footer">
              <button className="filter-btn" onClick={() => setShowCreateForm(false)}>Cancel</button>
              <button className="filter-btn active" onClick={handleCreateAlert} disabled={!createForm.engine_id || !createForm.message.trim()}>Create Alert</button>
            </div>
          </div>
        </div>
      )}

      {/* Alert list */}
      <div className="alert-list" id="alert-list">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Bell size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p>No alerts match the current filters</p>
          </div>
        )}
        {filtered.map((alert, i) => (
          <div
            key={alert.id}
            className={`alert-row ${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''} fade-in`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {!alert.acknowledged && (
              <input
                type="checkbox"
                checked={selected.has(alert.id)}
                onChange={() => toggleSelect(alert.id)}
                style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
              />
            )}
            <div className={`alert-severity ${alert.severity}`} />
            <span className="alert-message">
              {alert.message}
              {alert.custom && <span style={{ marginLeft: 8, fontSize: '0.65rem', color: 'var(--accent-primary-light)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: 8 }}>Custom</span>}
            </span>
            <span
              style={{ color: 'var(--accent-primary-light)', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
              onClick={() => navigate(`/engine/${alert.engine_id}`)}
            >
              View Engine →
            </span>
            <span className="alert-time">{formatTime(alert.timestamp)}</span>
            {!alert.acknowledged && (
              <button className="alert-ack-btn" onClick={() => handleAck(alert.id)}>
                <Check size={12} /> Ack
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
