import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis, YAxis,
} from 'recharts';
import { fetchModelMetrics } from '../api';

const DS_COLORS = { FD001: '#6366f1', FD002: '#22c55e', FD003: '#f59e0b', FD004: '#ef4444' };
const ALL_DS = ['FD001', 'FD002', 'FD003', 'FD004'];

export default function ModelPerformance() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDS, setActiveDS] = useState(new Set(ALL_DS));
  const [errorThreshold, setErrorThreshold] = useState(15);

  useEffect(() => {
    fetchModelMetrics()
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleDS = (ds) => setActiveDS(prev => {
    const next = new Set(prev);
    next.has(ds) ? next.delete(ds) : next.add(ds);
    return next;
  });

  const filteredScatter = useMemo(() => {
    if (!metrics) return [];
    return metrics.scatter_data.filter(p => activeDS.has(p.dataset));
  }, [metrics, activeDS]);

  const withinThreshold = useMemo(() => {
    if (!filteredScatter.length) return 0;
    const count = filteredScatter.filter(p => Math.abs(p.error) <= errorThreshold).length;
    return ((count / filteredScatter.length) * 100).toFixed(1);
  }, [filteredScatter, errorThreshold]);

  const handleExport = () => {
    if (!metrics) return;
    const rows = ['Dataset,True RUL,Predicted RUL,Error'];
    metrics.scatter_data.forEach(p => rows.push(`${p.dataset},${p.true_rul},${p.predicted_rul.toFixed(1)},${p.error.toFixed(1)}`));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'model_performance.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner" /><p className="loading-text">Loading model metrics…</p></div>;
  }
  if (!metrics) return <p>Failed to load metrics.</p>;

  const { overall, per_dataset, error_percentiles, version_comparison, improvements, scatter_data } = metrics;

  // Per-dataset bar data
  const barData = Object.entries(per_dataset).map(([ds, v]) => ({ name: ds, rmse: v.rmse }));

  // V1 vs V2 comparison
  const compData = [
    { metric: 'RMSE', v1: version_comparison.v1.rmse, v2: version_comparison.v2.rmse },
    { metric: 'R²', v1: version_comparison.v1.r2 * 100, v2: version_comparison.v2.r2 * 100 },
  ];

  // Error distribution bins — reactive to dataset filter
  const errorValues = filteredScatter.map(p => Math.abs(p.error));
  const bins = [0, 5, 10, 15, 20, 25, 30, 40, 50];
  const errorDist = bins.slice(0, -1).map((b, i) => ({
    range: `${b}-${bins[i + 1]}`,
    count: errorValues.filter(e => e >= b && e < bins[i + 1]).length,
  }));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Model Performance</h1>
          <p>V2 CNN + BiLSTM + Transformer — Ensemble + TTA evaluation metrics</p>
        </div>
        <button className="filter-btn" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Metric cards */}
      <div className="metrics-row">
        {[
          { val: overall.rmse, label: 'RMSE', sub: 'cycles' },
          { val: overall.mae, label: 'MAE', sub: 'cycles' },
          { val: overall.r2.toFixed(2), label: 'R²', sub: 'coefficient' },
          { val: overall.nasa_score.toLocaleString(), label: 'NASA Score', sub: 'lower = better' },
        ].map((m) => (
          <div key={m.label} className="metric-card fade-in" id={`metric-${m.label.toLowerCase()}`}>
            <div className="metric-value">{m.val}</div>
            <div className="metric-label">{m.label}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Error percentiles */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 14, fontSize: '0.95rem' }}>Error Percentiles</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(error_percentiles).map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.3rem', color: 'var(--accent-primary-light)' }}>
                {v}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {k.toUpperCase()} cycles
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
          50th percentile = 5.2 cycles — half of all predictions are within 5 cycles of truth
        </p>
      </div>

      <div className="chart-grid">
        {/* True vs Predicted Scatter */}
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>True vs Predicted RUL</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_DS.map(ds => (
                <button
                  key={ds}
                  className={`filter-btn${activeDS.has(ds) ? ' active' : ''}`}
                  onClick={() => toggleDS(ds)}
                  style={{ borderColor: activeDS.has(ds) ? DS_COLORS[ds] : undefined, fontSize: '0.75rem', padding: '3px 10px' }}
                >
                  {ds}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="true_rul" name="True RUL" domain={[0, 130]} tick={{ fontSize: 11 }} label={{ value: 'True RUL', position: 'insideBottom', offset: -4, fontSize: 11 }} />
              <YAxis type="number" dataKey="predicted_rul" name="Predicted RUL" domain={[0, 140]} tick={{ fontSize: 11 }} label={{ value: 'Predicted', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
                formatter={(val, name) => [val.toFixed(1), name]}
              />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 130, y: 130 }]} stroke="var(--accent-primary)" strokeDasharray="5 5" opacity={0.5} />
              {ALL_DS.filter(ds => activeDS.has(ds)).map(ds => (
                <Scatter
                  key={ds}
                  name={ds}
                  data={filteredScatter.filter(p => p.dataset === ds)}
                  fill={DS_COLORS[ds]}
                  fillOpacity={0.6}
                  r={3}
                />
              ))}
              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Per-dataset RMSE */}
        <div className="chart-card">
          <h3>RMSE by Dataset</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} label={{ value: 'RMSE', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }} />
              <Bar dataKey="rmse" radius={[8, 8, 0, 0]}>
                {barData.map((entry) => (
                  <Cell key={entry.name} fill={DS_COLORS[entry.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Threshold Analyzer */}
        <div className="chart-card">
          <h3>Error Threshold Analyzer</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Within ±{errorThreshold} cycles:
              </span>
              <input
                type="range" min={1} max={50} value={errorThreshold}
                onChange={e => setErrorThreshold(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '0.85rem', minWidth: 32, textAlign: 'right', color: 'var(--text-muted)' }}>{errorThreshold}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '2rem', color: Number(withinThreshold) >= 80 ? 'var(--color-healthy)' : Number(withinThreshold) >= 60 ? 'var(--color-warning)' : 'var(--color-critical)' }}>
                  {withinThreshold}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>of predictions within ±{errorThreshold} cycles</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '2rem', color: 'var(--text-secondary)' }}>
                  {filteredScatter.length}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>engines in selection</div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Distribution */}
        <div className="chart-card">
          <h3>Absolute Error Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={errorDist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} label={{ value: 'Abs Error (cycles)', position: 'insideBottom', offset: -4, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* V1 vs V2 comparison */}
        <div className="chart-card">
          <h3>V1 → V2 Improvement</h3>
          <div style={{ marginBottom: 16 }}>
            <table className="results-table">
              <thead>
                <tr><th>Metric</th><th>V1</th><th>V2</th><th>Change</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>RMSE</td><td>{version_comparison.v1.rmse}</td><td style={{ color: 'var(--color-healthy)', fontWeight: 700 }}>{version_comparison.v2.rmse}</td>
                  <td style={{ color: 'var(--color-healthy)' }}>-31.5%</td>
                </tr>
                <tr>
                  <td>R²</td><td>{version_comparison.v1.r2}</td><td style={{ color: 'var(--color-healthy)', fontWeight: 700 }}>{version_comparison.v2.r2}</td>
                  <td style={{ color: 'var(--color-healthy)' }}>+12.5%</td>
                </tr>
                <tr>
                  <td>NASA Score</td><td>{version_comparison.v1.nasa_score.toLocaleString()}</td><td style={{ color: 'var(--color-healthy)', fontWeight: 700 }}>{version_comparison.v2.nasa_score.toLocaleString()}</td>
                  <td style={{ color: 'var(--color-healthy)' }}>-89.2%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 style={{ fontSize: '0.85rem', marginBottom: 8 }}>10 Improvements Applied</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {improvements.map((imp, i) => (
              <span key={i} style={{
                background: 'var(--accent-glow)',
                border: '1px solid var(--border-accent)',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: '0.7rem',
                color: 'var(--accent-primary-light)',
              }}>
                {imp}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
