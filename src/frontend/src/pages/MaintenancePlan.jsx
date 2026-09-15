import { Wrench, AlertTriangle, XCircle, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMaintenancePlan } from '../api';

// ── Shared readiness badge (same as ReadinessDashboard) ───────────────────────
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

// ── Action badge ──────────────────────────────────────────────────────────────
function ActionBadge({ action }) {
  const isImmediate = action === 'Immediate Overhaul';
  const isPriority = action === 'Priority Inspection';
  const color = isImmediate ? 'var(--color-critical)' : isPriority ? 'var(--color-warning)' : 'var(--accent-primary-light)';
  const bg = isImmediate ? 'var(--color-critical-bg)' : isPriority ? 'var(--color-warning-bg)' : 'var(--accent-glow)';
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
      <Wrench size={11} />
      {action}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MaintenancePlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    getMaintenancePlan()
      .then(setPlan)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (engineId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(engineId) ? next.delete(engineId) : next.add(engineId);
      return next;
    });
  };

  const handleExportCSV = () => {
    if (!plan) return;
    const header = 'Rank,Engine ID,Status,Recommended Action,Urgency Score,RUL,Cycles to Mission,Fails Before Mission';
    const rows = plan.map(p =>
      [p.rank, p.engine_id, p.status, p.recommended_action, p.urgency_score, p.rul.toFixed(1), p.cycles_to_mission, p.fails_before_mission].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'maintenance_plan.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Generating maintenance plan…</p>
      </div>
    );
  }

  if (!plan) return <p style={{ color: 'var(--text-muted)' }}>Failed to load maintenance plan.</p>;

  const immediateCount = plan.filter(p => p.recommended_action === 'Immediate Overhaul').length;
  const priorityCount = plan.filter(p => p.recommended_action === 'Priority Inspection').length;
  const scheduleCount = plan.filter(p => p.recommended_action === 'Schedule Inspection').length;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Maintenance Plan</h1>
          <p>Prioritised plan for {plan.length} non-ready engines — ranked by mission urgency</p>
        </div>
        <button
          className="filter-btn"
          onClick={handleExportCSV}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Summary bar */}
      <div className="stats-bar" style={{ marginBottom: 20 }}>
        <div className="stat-card fade-in fade-in-delay-1">
          <div className="stat-icon critical"><XCircle size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--color-critical)' }}>{immediateCount}</div>
            <div className="stat-label">Immediate Overhaul</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-2">
          <div className="stat-icon warning"><AlertTriangle size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{priorityCount}</div>
            <div className="stat-label">Priority Inspection</div>
          </div>
        </div>
        <div className="stat-card fade-in fade-in-delay-3">
          <div className="stat-icon accent"><Wrench size={20} /></div>
          <div>
            <div className="stat-value" style={{ color: 'var(--accent-primary-light)' }}>{scheduleCount}</div>
            <div className="stat-label">Schedule Inspection</div>
          </div>
        </div>
      </div>

      {plan.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Wrench size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p>All engines are mission-ready — no maintenance actions required.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.map((item, i) => {
            const isExpanded = expanded.has(item.engine_id);
            const borderColor =
              item.recommended_action === 'Immediate Overhaul'
                ? 'var(--color-critical)'
                : item.recommended_action === 'Priority Inspection'
                ? 'var(--color-warning)'
                : 'var(--border-accent)';

            return (
              <div
                key={item.engine_id}
                className="card fade-in"
                style={{
                  borderLeft: `3px solid ${borderColor}`,
                  padding: '14px 18px',
                  animationDelay: `${Math.min(i * 30, 300)}ms`,
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* Rank */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--accent-glow)',
                      border: '1px solid var(--border-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Outfit',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      color: 'var(--accent-primary-light)',
                      flexShrink: 0,
                    }}
                  >
                    {item.rank}
                  </div>

                  {/* Engine ID — clickable */}
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      minWidth: 80,
                    }}
                    onClick={() => navigate(`/engine/${item.engine_id}`)}
                  >
                    Engine #{item.engine_id}
                  </span>

                  <ReadinessBadge status={item.status} />
                  <ActionBadge action={item.recommended_action} />

                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Urgency Score</div>
                      <div style={{
                        fontFamily: 'Outfit', fontWeight: 700, fontSize: '0.9rem',
                        color: item.urgency_score > 0 ? 'var(--color-critical)' : 'var(--color-warning)',
                      }}>
                        {item.urgency_score > 0 ? `+${item.urgency_score}` : item.urgency_score}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>RUL</div>
                      <div style={{
                        fontFamily: 'Outfit', fontWeight: 700, fontSize: '0.9rem',
                        color: item.rul > 30 ? 'var(--color-warning)' : 'var(--color-critical)',
                      }}>
                        {item.rul.toFixed(1)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Cycles to Mission</div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {item.cycles_to_mission}
                      </div>
                    </div>
                    <button
                      className="filter-btn"
                      style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => toggleExpand(item.engine_id)}
                    >
                      {isExpanded ? 'Hide' : 'Rationale'}
                    </button>
                  </div>
                </div>

                {/* Expandable explanation */}
                {isExpanded && (
                  <div
                    className="fade-in"
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'var(--bg-glass)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {item.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
