import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis, YAxis
} from 'recharts';
import { fetchEngineDetail, fetchFleetAnalytics, fetchFleetStatus } from '../api';

const COLORS_PIE = ['#22c55e', '#f59e0b', '#ef4444'];
const COMPARE_COLORS = ['#6366f1', '#22c55e', '#f59e0b'];

export default function FleetAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState([]);
  const [compareData, setCompareData] = useState({});
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchFleetAnalytics(), fetchFleetStatus()])
      .then(([a, f]) => { setAnalytics(a); setFleet(f); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch detail data for selected comparison engines
  useEffect(() => {
    const toFetch = compare.filter(eid => !compareData[eid]);
    if (toFetch.length === 0) return;
    setCompareLoading(true);
    Promise.all(toFetch.map(eid => fetchEngineDetail(eid).then(d => [eid, d])))
      .then(results => {
        setCompareData(prev => {
          const next = { ...prev };
          results.forEach(([eid, d]) => { next[eid] = d; });
          return next;
        });
      })
      .catch(console.error)
      .finally(() => setCompareLoading(false));
  }, [compare]);

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner" /><p className="loading-text">Loading analytics…</p></div>;
  }
  if (!analytics) return <p>Failed to load analytics.</p>;

  // RUL distribution data
  const distData = Object.entries(analytics.rul_distribution).map(([range, count]) => ({
    range, count,
  }));

  // Health pie data
  const healthData = Object.entries(analytics.health_breakdown).map(([name, value]) => ({
    name, value,
  }));

  // Dataset comparison
  const datasetData = Object.entries(analytics.dataset_stats).map(([name, stats]) => ({
    name, ...stats,
  }));

  // Comparative engine selection
  const engines = fleet?.engines || [];
  const toggleCompare = (eid) => {
    setCompare(prev =>
      prev.includes(eid) ? prev.filter(x => x !== eid) : prev.length < 3 ? [...prev, eid] : prev
    );
  };

  // Build merged RUL history for comparison chart
  const buildComparisonData = () => {
    if (compare.length === 0) return [];
    const allCycles = new Set();
    compare.forEach(eid => {
      const detail = compareData[eid];
      if (detail?.rul_history) detail.rul_history.forEach(p => allCycles.add(p.cycle));
    });
    const sorted = [...allCycles].sort((a, b) => a - b);
    return sorted.map(cycle => {
      const point = { cycle };
      compare.forEach(eid => {
        const detail = compareData[eid];
        const match = detail?.rul_history?.find(p => p.cycle === cycle);
        if (match) point[`engine_${eid}`] = match.rul;
      });
      return point;
    });
  };

  const handleExportAnalytics = () => {
    const rows = engines.map(e =>
      [e.engine_id, e.dataset, e.rul.toFixed(2), e.health_status, e.cycles].join(',')
    );
    const csv = ['Engine ID,Dataset,RUL,Health,Cycles', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fleet_analytics.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const comparisonData = buildComparisonData();

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Fleet Analytics</h1>
          <p>Aggregated insights across {analytics.total_engines} engines — average RUL: {analytics.fleet_avg_rul} cycles</p>
        </div>
        <button className="filter-btn" onClick={handleExportAnalytics} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="chart-grid">
        {/* RUL Distribution */}
        <div className="chart-card">
          <h3>RUL Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {distData.map((entry, i) => {
                  const colors = ['#ef4444', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'];
                  return <Cell key={i} fill={colors[i] || '#6366f1'} opacity={0.85} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Health Status Donut */}
        <div className="chart-card">
          <h3>Health Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={healthData}
                cx="50%" cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {healthData.map((_, i) => (
                  <Cell key={i} fill={COLORS_PIE[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Dataset Comparison */}
        <div className="chart-card">
          <h3>Per-Dataset Statistics</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datasetData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
              />
              <Bar dataKey="avg_rul" fill="#6366f1" radius={[6, 6, 0, 0]} name="Avg RUL" />
              <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Engine Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Comparative Engine Analysis */}
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <h3>Comparative Engine Analysis</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
            Select up to 3 engines to compare RUL degradation trends
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, maxHeight: 80, overflowY: 'auto' }}>
            {engines.slice(0, 30).map(e => (
              <button
                key={e.engine_id}
                className={`filter-btn ${compare.includes(e.engine_id) ? 'active' : ''}`}
                onClick={() => toggleCompare(e.engine_id)}
                style={{ padding: '4px 10px', fontSize: '0.72rem' }}
              >
                #{e.engine_id} ({e.rul.toFixed(0)})
              </button>
            ))}
          </div>
          {compare.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Comparing: {compare.map((eid, i) => {
                  const eng = engines.find(e => e.engine_id === eid);
                  return (
                    <span key={eid} style={{ marginRight: 12, color: COMPARE_COLORS[i] }}>
                      ● Engine {eid}: RUL {eng?.rul?.toFixed(0) || '—'}, {eng?.health_status || '—'}
                    </span>
                  );
                })}
              </div>
              {compareLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Loading engine data…</div>
              ) : comparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cycle" tick={{ fontSize: 11 }} label={{ value: 'Cycle', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                    <YAxis domain={[0, 130]} tick={{ fontSize: 11 }} label={{ value: 'Predicted RUL', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
                    />
                    <Legend />
                    {compare.map((eid, i) => (
                      <Line
                        key={eid}
                        type="monotone"
                        dataKey={`engine_${eid}`}
                        stroke={COMPARE_COLORS[i]}
                        strokeWidth={2}
                        dot={false}
                        name={`Engine ${eid}`}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>
                  No RUL history data available for selected engines
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 30 }}>
              Click engine buttons above to compare their RUL degradation trends
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
