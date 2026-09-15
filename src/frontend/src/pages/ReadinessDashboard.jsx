import { CheckCircle, AlertTriangle, XCircle, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReadiness } from '../api';

// ── Readiness badge (mirrors HealthBadge color conventions) ──────────────────
function ReadinessBadge({ status }) {
  const COLOR = {
    READY: 'var(--color-healthy)',
    AT_RISK: 'var(--color-warning)',
    NOT_READY: 'var(--color-critical)',
  };
  const BG = {
    READY: 'var(--color-healthy-bg)',
    AT_RISK: 'var(--color-warning-bg)',
    NOT_READY: 'var(--color-critical-bg)',
  };
  const color = COLOR[status] || 'var(--text-muted)';
  const bg = BG[status] || 'transparent';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: '0.72rem',
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ReadinessDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('urgency');
  const navigate = useNavigate();

  useEffect(() => {
    getReadiness()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Assessing mission readiness…</p>
      </div>
    );
  }

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>Failed to load readiness data.</p>;

  const { fleet_summary, engines } = data;

  // Filter
  let rows = filter === 'all' ? engines : engines.filter(e => e.status === filter);

  // Sort
  if (sortBy === 'urgency') {
    // NOT_READY+fails_before first, then AT_RISK, then READY; within group sort by rul asc
    const order = { NOT_READY: 0, AT_RISK: 1, READY: 2 };
    rows = [...rows].sort((a, b) => {
      const od = order[a.status] - order[b.status];
      return od !== 0 ? od : a.rul - b.rul;
    });
  } else if (sortBy === 'rul-asc') {
    rows = [...rows].sort((a, b) => a.rul - b.rul);
  } else if (sortBy === 'id') {
    rows = [...rows].sort((a, b) => parseInt(a.engine_id) - parseInt(b.engine_id));
  }

  const FILTERS = ['all', 'READY', 'AT_RISK', 'NOT_READY'];
  const filterLabel = { all: 'All', READY: 'Ready', AT_RISK: 'At Risk', NOT_READY: 'Not Ready' };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Mission Readiness</h1>
        <p>Fleet assessment against the next mission window — {fleet_summary.ready_pct}% of engines are mission-ready</p>
      </div>

      {/* Summary bar */}
      <div className="stats-bar" style={{ marginBottom: 20 }}>
        <div className="stat-card fade-in fade-in-delay-1" id="stat-total-readiness">
          <div className="stat-icon accent"><Shield size={20} /></div>
          <div>
            <div className="stat-value">{fleet_summary.total}</div>
            <div className="stat-label">Total Engines</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-2" id="stat-ready">
          <div className="stat-icon healthy"><CheckCircle size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--color-healthy)' }}>{fleet_summary.ready}</div>
            <div className="stat-label">Ready</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-3" id="stat-at-risk">
          <div className="stat-icon warning"><AlertTriangle size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{fleet_summary.at_risk}</div>
            <div className="stat-label">At Risk</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-4" id="stat-not-ready">
          <div className="stat-icon critical"><XCircle size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--color-critical)' }}>{fleet_summary.not_ready}</div>
            <div className="stat-label">Not Ready</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-5" id="stat-ready-pct">
          <div className="stat-icon accent">
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '1rem' }}>%</span>
          </div>
          <div>
            <div
              className="stat-value"
              style={{ color: fleet_summary.ready_pct >= 70 ? 'var(--color-healthy)' : fleet_summary.ready_pct >= 40 ? 'var(--color-warning)' : 'var(--color-critical)' }}
            >
              {fleet_summary.ready_pct}
            </div>
            <div className="stat-label">Ready %</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls-bar" style={{ marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {filterLabel[f]}
          </button>
        ))}
        <select
          className="sort-select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ marginLeft: 'auto' }}
        >
          <option value="urgency">Urgency</option>
          <option value="rul-asc">RUL ↑ Most Critical</option>
          <option value="id">Engine ID</option>
        </select>
      </div>

      {/* Engine table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="results-table">
            <thead>
              <tr>
                <th>Engine</th>
                <th>Status</th>
                <th>Health</th>
                <th>Predicted RUL</th>
                <th>Cycles to Mission</th>
                <th>Fails Before Mission</th>
                <th>Confidence ±</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((eng, i) => (
                <tr
                  key={eng.engine_id}
                  className="clickable-row fade-in"
                  style={{ animationDelay: `${Math.min(i * 20, 300)}ms`, cursor: 'pointer' }}
                  onClick={() => navigate(`/engine/${eng.engine_id}`)}
                >
                  <td style={{ fontWeight: 600 }}>#{eng.engine_id}</td>
                  <td><ReadinessBadge status={eng.status} /></td>
                  <td style={{
                    color: eng.health_status === 'Critical' ? 'var(--color-critical)'
                      : eng.health_status === 'Warning' ? 'var(--color-warning)'
                      : 'var(--color-healthy)',
                    fontWeight: 600, fontSize: '0.82rem',
                  }}>
                    {eng.health_status}
                  </td>
                  <td style={{
                    fontWeight: 700,
                    fontFamily: 'Outfit',
                    color: eng.rul > 60 ? 'var(--color-healthy)' : eng.rul > 30 ? 'var(--color-warning)' : 'var(--color-critical)',
                  }}>
                    {eng.rul.toFixed(1)}
                  </td>
                  <td style={{ color: eng.cycles_to_mission < 0 ? 'var(--color-critical)' : 'var(--text-secondary)' }}>
                    {eng.cycles_to_mission}
                  </td>
                  <td>
                    {eng.fails_before_mission
                      ? <span style={{ color: 'var(--color-critical)', fontWeight: 700, fontSize: '0.78rem' }}>⚠ Yes</span>
                      : <span style={{ color: 'var(--color-healthy)', fontSize: '0.78rem' }}>No</span>
                    }
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>±{eng.confidence_std.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
