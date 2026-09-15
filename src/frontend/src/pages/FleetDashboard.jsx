import { Download, Search, Star, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFleetStatus, fetchWatchlist, scheduleMaintenance, toggleWatchlist } from '../api';
import HealthBadge from '../components/HealthBadge';
import RULGauge from '../components/RULGauge';
import StatsBar from '../components/StatsBar';

export default function FleetDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rul-asc');
  const [watched, setWatched] = useState(new Set());
  const [schedModal, setSchedModal] = useState(null);
  const [schedForm, setSchedForm] = useState({ start: '', end: '', type: 'Inspection', notes: '' });
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([fetchFleetStatus(), fetchWatchlist()])
      .then(([d, w]) => { setData(d); setWatched(new Set(w.watched || [])); })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleWatch = async (e, engineId) => {
    e.stopPropagation();
    try {
      const res = await toggleWatchlist(String(engineId));
      setWatched(prev => {
        const next = new Set(prev);
        res.watched ? next.add(String(engineId)) : next.delete(String(engineId));
        return next;
      });
    } catch (err) { console.error(err); }
  };

  const handleExportCSV = () => {
    if (!data) return;
    const rows = data.engines.map(e =>
      [e.engine_id, e.dataset, e.rul.toFixed(2), e.health_status, e.cycles, (e.confidence_std || 0).toFixed(2), watched.has(String(e.engine_id)) ? 'Yes' : 'No'].join(',')
    );
    const csv = ['Engine ID,Dataset,RUL,Health,Cycles,Confidence Std,Watched', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fleet_overview.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const openSchedule = (e, engine) => {
    e.stopPropagation();
    setSchedForm({ start: String(engine.cycles + 1), end: String(engine.cycles + 10), type: 'Inspection', notes: '' });
    setSchedModal(engine);
  };

  const handleSchedule = async () => {
    if (!schedModal) return;
    try {
      await scheduleMaintenance({
        engine_id: String(schedModal.engine_id),
        start_cycle: parseInt(schedForm.start),
        end_cycle: parseInt(schedForm.end),
        type: schedForm.type,
        notes: schedForm.notes,
      });
      setSchedModal(null);
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Loading fleet data…</p>
      </div>
    );
  }

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>Failed to load fleet data.</p>;

  let engines = [...data.engines];

  // Filter
  if (filter === 'watched') {
    engines = engines.filter((e) => watched.has(String(e.engine_id)));
  } else if (filter !== 'all') {
    engines = engines.filter((e) => e.health_status.toLowerCase() === filter);
  }

  // Search
  if (search) {
    const q = search.toLowerCase();
    engines = engines.filter(
      (e) =>
        e.engine_id.toString().includes(q) ||
        e.dataset.toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortBy === 'rul-asc') engines.sort((a, b) => a.rul - b.rul);
  else if (sortBy === 'rul-desc') engines.sort((a, b) => b.rul - a.rul);
  else if (sortBy === 'id') engines.sort((a, b) => parseInt(a.engine_id) - parseInt(b.engine_id));

  const filters = ['all', 'critical', 'warning', 'healthy', 'watched'];

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Fleet Overview</h1>
        <p>Real-time monitoring of all turbofan engines — C-MAPSS V2 Ensemble</p>
      </div>

      <StatsBar summary={data.summary} />

      <div className="controls-bar">
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            id="engine-search"
            className="search-input"
            placeholder="Search engine ID or dataset…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {filters.map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
            id={`filter-${f}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          id="sort-select"
        >
          <option value="rul-asc">RUL ↑ Most Critical</option>
          <option value="rul-desc">RUL ↓ Healthiest</option>
          <option value="id">Engine ID</option>
        </select>

        <button className="filter-btn" onClick={handleExportCSV} title="Export fleet as CSV" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="engine-grid">
        {engines.map((engine, i) => {
          const cls = engine.health_status.toLowerCase();
          const isWatched = watched.has(String(engine.engine_id));
          return (
            <div
              key={engine.engine_id}
              className={`engine-card ${cls} fade-in`}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              onClick={() => navigate(`/engine/${engine.engine_id}`)}
              id={`engine-card-${engine.engine_id}`}
            >
              <div className="engine-card-top">
                <div>
                  <div className="engine-id">Engine {engine.engine_id}</div>
                  <span className="engine-dataset">{engine.dataset}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="icon-btn"
                    title="Schedule maintenance"
                    onClick={(e) => openSchedule(e, engine)}
                  >
                    <Wrench size={14} />
                  </button>
                  <button
                    className={`icon-btn star-btn ${isWatched ? 'starred' : ''}`}
                    title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                    onClick={(e) => handleToggleWatch(e, engine.engine_id)}
                  >
                    <Star size={14} fill={isWatched ? 'var(--color-warning)' : 'none'} />
                  </button>
                  <HealthBadge status={engine.health_status} />
                </div>
              </div>
              <div className="engine-card-body">
                <RULGauge rul={engine.rul} size={78} />
                <div className="engine-card-info">
                  <div className={`engine-rul ${cls}`}>{engine.rul.toFixed(0)}</div>
                  <div className="engine-rul-label">Predicted RUL</div>
                  <div className="engine-cycles">{engine.cycles} cycles completed</div>
                  {engine.confidence_std > 0 && (
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      ±{engine.confidence_std.toFixed(1)} std
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Schedule Modal */}
      {schedModal && (
        <div className="modal-overlay" onClick={() => setSchedModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Maintenance — Engine {schedModal.engine_id}</h3>
              <button className="icon-btn" onClick={() => setSchedModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <label>Start Cycle
                <input type="number" value={schedForm.start} onChange={(e) => setSchedForm(p => ({ ...p, start: e.target.value }))} />
              </label>
              <label>End Cycle
                <input type="number" value={schedForm.end} onChange={(e) => setSchedForm(p => ({ ...p, end: e.target.value }))} />
              </label>
              <label>Type
                <select value={schedForm.type} onChange={(e) => setSchedForm(p => ({ ...p, type: e.target.value }))}>
                  <option>Inspection</option><option>Repair</option><option>Overhaul</option>
                </select>
              </label>
              <label>Notes
                <input type="text" value={schedForm.notes} onChange={(e) => setSchedForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" />
              </label>
            </div>
            <div className="modal-footer">
              <button className="filter-btn" onClick={() => setSchedModal(null)}>Cancel</button>
              <button className="filter-btn active" onClick={handleSchedule}>Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
