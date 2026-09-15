import * as d3 from 'd3';
import { ArrowLeft, Download, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis, YAxis,
} from 'recharts';
import { addEngineNote, deleteEngineNote, fetchEngineDetail, fetchEngineNotes, getExplanation, getServiceHistory } from '../api';
import HealthBadge from '../components/HealthBadge';
import RULGauge from '../components/RULGauge';
import { usePredictions } from '../PredictionContext';

export default function EngineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const heatmapRef = useRef(null);
  const { getCachedEngineDetail } = usePredictions();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [copilot, setCopilot] = useState(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [serviceHistory, setServiceHistory] = useState([]);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    // For uploaded engines, try the client-side cache first
    if (id.startsWith('upload_')) {
      const cached = getCachedEngineDetail(id);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }
    fetchEngineDetail(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, getCachedEngineDetail]);

  // Load notes
  useEffect(() => {
    if (!id.startsWith('upload_')) {
      fetchEngineNotes(id).then(setNotes).catch(() => {});
    }
  }, [id]);

  // Load copilot explanation (skip for uploaded engines — no fleet readiness context)
  useEffect(() => {
    if (id.startsWith('upload_')) return;
    setCopilotLoading(true);
    getExplanation(id)
      .then(setCopilot)
      .catch(() => setCopilot(null))
      .finally(() => setCopilotLoading(false));
  }, [id]);

  // Load service history (skip for uploaded engines)
  useEffect(() => {
    if (id.startsWith('upload_')) return;
    getServiceHistory(id)
      .then(setServiceHistory)
      .catch(() => setServiceHistory([]));
  }, [id]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      const note = await addEngineNote(id, newNote);
      setNotes(prev => [note, ...prev]);
      setNewNote('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteEngineNote(id, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) { console.error(e); }
  };

  const handleExportEngine = () => {
    if (!data) return;
    const lines = [
      `Engine ${data.engine_id} — ${data.dataset}`,
      `Health: ${data.health_status}`,
      `RUL: ${data.rul.toFixed(2)}`,
      `Cycles: ${data.cycles}`,
      `Confidence Std: ${data.confidence_std?.toFixed(2) || 'N/A'}`,
      '',
      'Cycle,RUL',
      ...(data.rul_history || []).map(r => `${r.cycle},${r.rul.toFixed(2)}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `engine_${data.engine_id}_report.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Draw heatmap when data loads
  useEffect(() => {
    if (!data || !heatmapRef.current || !data.sensor_data) return;
    drawHeatmap(heatmapRef.current, data);
  }, [data]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Loading engine data…</p>
      </div>
    );
  }

  if (!data) return <p>Engine not found.</p>;

  // Key sensors to show
  const sensorKeys = Object.keys(data.sensor_data || {}).filter(
    (s) => !['sensor_1','sensor_5','sensor_6','sensor_10','sensor_16','sensor_18','sensor_19'].includes(s)
  ).slice(0, 6);

  // Build sensor trend data
  const sensorTrendData = (data.cycle_list || []).map((c, i) => {
    const point = { cycle: c };
    sensorKeys.forEach((s) => {
      if (data.sensor_data[s]) point[s] = data.sensor_data[s][i];
    });
    return point;
  });

  // Downsample for performance
  const step = Math.max(1, Math.floor(sensorTrendData.length / 150));
  const downsampled = sensorTrendData.filter((_, i) => i % step === 0 || i === sensorTrendData.length - 1);

  // RUL history data
  const rulHistory = data.rul_history || [];

  // Attention weights
  const attnData = (data.attention_weights || []).map((w, i) => ({
    timestep: i + 1,
    weight: w,
  }));

  // Cumulative degradation
  const cumdegSensors = Object.keys(data.cumdeg_data || {}).slice(0, 6);
  const cumdegData = (data.cycle_list || []).map((c, i) => {
    const point = { cycle: c };
    cumdegSensors.forEach((s) => {
      if (data.cumdeg_data[s]) point[s] = data.cumdeg_data[s][i];
    });
    return point;
  });
  const cumdegDownsampled = cumdegData.filter((_, i) => i % step === 0 || i === cumdegData.length - 1);

  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate(id.startsWith('upload_') ? '/upload' : '/')} id="back-to-fleet">
          <ArrowLeft size={16} /> {id.startsWith('upload_') ? 'Predictions' : 'Fleet'}
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Engine {id.startsWith('upload_') ? id.split('_').pop() : data.engine_id}
            {id.startsWith('upload_') && <span style={{ fontSize: '0.8rem', fontWeight: 500, opacity: 0.7 }}> (Uploaded)</span>}
          </h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Dataset {data.dataset} · {data.cycles} cycles
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="filter-btn" onClick={() => setNotesOpen(!notesOpen)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquarePlus size={14} /> Notes {notes.length > 0 && <span className="badge-count">{notes.length}</span>}
          </button>
          {!id.startsWith('upload_') && (
            <button className="filter-btn" onClick={() => setServiceHistoryOpen(!serviceHistoryOpen)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              🔧 Service History {serviceHistory.length > 0 && <span className="badge-count">{serviceHistory.length}</span>}
            </button>
          )}
          <button className="filter-btn" onClick={handleExportEngine} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Notes Panel */}
      {notesOpen && (
        <div className="notes-panel fade-in">
          <div className="notes-input-row">
            <input
              type="text"
              className="search-input"
              placeholder="Add a note about this engine…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              style={{ flex: 1 }}
            />
            <button className="filter-btn active" onClick={handleAddNote} disabled={!newNote.trim()}>
              <Send size={14} />
            </button>
          </div>
          {notes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 12 }}>
              No notes yet. Add observations, maintenance remarks, or concerns.
            </p>
          ) : (
            <div className="notes-list">
              {notes.map(n => (
                <div key={n.id} className="note-item">
                  <div className="note-text">{n.text}</div>
                  <div className="note-meta">
                    <span>{new Date(n.timestamp).toLocaleString()}</span>
                    <button className="icon-btn" onClick={() => handleDeleteNote(n.id)} title="Delete note">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Service History Panel */}
      {serviceHistoryOpen && !id.startsWith('upload_') && (
        <div className="notes-panel fade-in" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.05em' }}>
            SERVICE HISTORY
          </div>
          {serviceHistory.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 12 }}>
              No service history on record for this engine.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Date', 'Type', 'Cycle', 'Components', 'Notes'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {serviceHistory.map(rec => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        {new Date(rec.date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {rec.type}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {rec.cycle_at_service}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                        {(rec.components_serviced || []).join(', ')}
                      </td>
                      <td style={{ padding: '6px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={rec.technician_notes}>
                        {rec.technician_notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info cards */}
      <div className="detail-info-grid">
        <div className="stat-card">
          <RULGauge rul={data.rul} size={64} />
          <div>
            <div className="stat-value">{data.rul.toFixed(1)}</div>
            <div className="stat-label">Predicted RUL</div>
          </div>
        </div>
        <div className="stat-card">
          <div><HealthBadge status={data.health_status} /></div>
          <div>
            <div className="stat-label" style={{ marginTop: 6 }}>
              {(data.health_probs || []).map((p, i) =>
                <span key={i} style={{ marginRight: 8, fontSize: '0.75rem' }}>
                  {['H','W','C'][i]}: {(p * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">{data.cycles}</div>
            <div className="stat-label">Cycles Completed</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-value">±{data.confidence_std?.toFixed(1) || '—'}</div>
            <div className="stat-label">Ensemble Std (cycles)</div>
          </div>
        </div>
      </div>

      {/* ── Copilot Readiness Panel ─────────────────────────────────── */}
      {!id.startsWith('upload_') && (copilot || copilotLoading) && (
        <div
          className="chart-card fade-in"
          style={{
            marginBottom: 20,
            borderLeft: copilot
              ? copilot.readiness.status === 'NOT_READY'
                ? '3px solid var(--color-critical)'
                : copilot.readiness.status === 'AT_RISK'
                ? '3px solid var(--color-warning)'
                : '3px solid var(--color-healthy)'
              : '3px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: copilot ? 12 : 0 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              MISSION READINESS
            </span>
            {copilotLoading && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assessing…</span>
            )}
            {copilot && (() => {
              const s = copilot.readiness.status;
              const color = s === 'NOT_READY' ? 'var(--color-critical)' : s === 'AT_RISK' ? 'var(--color-warning)' : 'var(--color-healthy)';
              const bg = s === 'NOT_READY' ? 'var(--color-critical-bg)' : s === 'AT_RISK' ? 'var(--color-warning-bg)' : 'var(--color-healthy-bg)';
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: '0.72rem', fontWeight: 700,
                  color, background: bg, border: `1px solid ${color}33`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {s.replace('_', ' ')}
                </span>
              );
            })()}
            {copilot && (
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {copilot.readiness.cycles_to_mission} cycles to mission window
              </span>
            )}
          </div>
          {copilot && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
              {copilot.explanation}
            </p>
          )}
        </div>
      )}

      <div className="chart-grid">
        {/* RUL Trend */}
        {rulHistory.length > 0 && (
          <div className="chart-card">
            <h3>RUL Prediction Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={rulHistory}>
                <defs>
                  <linearGradient id="rulGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 130]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8,
                  }}
                />
                <ReferenceLine y={60} stroke="var(--color-healthy)" strokeDasharray="5 5" opacity={0.5} />
                <ReferenceLine y={30} stroke="var(--color-warning)" strokeDasharray="5 5" opacity={0.5} />
                <ReferenceLine y={15} stroke="var(--color-critical)" strokeDasharray="5 5" opacity={0.5} />
                <Area type="monotone" dataKey="rul" stroke="#6366f1" fill="url(#rulGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sensor Heatmap */}
        <div className="chart-card">
          <h3>Sensor Heatmap</h3>
          <div className="heatmap-container" ref={heatmapRef} id="sensor-heatmap" />
        </div>

        {/* Key Sensor Trends */}
        {sensorKeys.length > 0 && (
          <div className="chart-card">
            <h3>Key Sensor Trends</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={downsampled}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8,
                  }}
                />
                {sensorKeys.map((s, i) => {
                  // Annotate with component name if the copilot response carries it
                  const annotated = copilot?.top_sensors?.find(ts => ts.startsWith(s + ' ') || ts === s);
                  const displayName = annotated || s.replace('_', ' ');
                  return (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                      name={displayName}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Attention Weights */}
        {attnData.length > 0 && (
          <div className="chart-card">
            <h3>Temporal Attention Weights</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
              Which timesteps the model focused on for its prediction
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={attnData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestep" tick={{ fontSize: 10 }} label={{ value: 'Timestep', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8,
                  }}
                  formatter={(val) => [val.toFixed(4), 'Attention']}
                />
                <Bar dataKey="weight" fill="#6366f1" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Cumulative Degradation */}
        {cumdegSensors.length > 0 && (
          <div className="chart-card">
            <h3>Cumulative Degradation</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
              Total accumulated damage per sensor — like an odometer for wear
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumdegDownsampled}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8,
                  }}
                />
                {cumdegSensors.map((s, i) => {
                  const annotated = copilot?.top_sensors?.find(ts => ts.startsWith(s + ' ') || ts === s);
                  const displayName = annotated ? annotated + ' cumdeg' : s.replace('_', ' ') + ' cumdeg';
                  return (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                      name={displayName}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}


/* ── D3 Heatmap ───────────────────────────────────────────────── */
function drawHeatmap(container, data) {
  const sensorData = data.sensor_data || {};
  const sensors = Object.keys(sensorData).filter(
    (s) => !['sensor_1','sensor_5','sensor_6','sensor_10','sensor_16','sensor_18','sensor_19'].includes(s)
  );
  if (sensors.length === 0) return;

  const cycles = data.cycle_list || [];
  const step = Math.max(1, Math.floor(cycles.length / 80));
  const sampledIndices = [];
  for (let i = 0; i < cycles.length; i += step) sampledIndices.push(i);
  if (sampledIndices[sampledIndices.length - 1] !== cycles.length - 1) {
    sampledIndices.push(cycles.length - 1);
  }

  const cellW = 7, cellH = 22;
  const margin = { top: 10, right: 20, bottom: 30, left: 75 };
  const width = sampledIndices.length * cellW + margin.left + margin.right;
  const height = sensors.length * cellH + margin.top + margin.bottom;

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Normalize per sensor
  const allVals = [];
  sensors.forEach((s) => {
    const vals = sensorData[s];
    const min = d3.min(vals);
    const max = d3.max(vals);
    const range = max - min || 1;
    sampledIndices.forEach((idx, col) => {
      const norm = (vals[idx] - min) / range;
      allVals.push({ sensor: s, col, norm, raw: vals[idx], cycle: cycles[idx] });
    });
  });

  const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.selectAll('rect')
    .data(allVals)
    .join('rect')
    .attr('x', (d) => d.col * cellW)
    .attr('y', (d) => sensors.indexOf(d.sensor) * cellH)
    .attr('width', cellW - 1)
    .attr('height', cellH - 1)
    .attr('rx', 1)
    .attr('fill', (d) => colorScale(d.norm))
    .attr('opacity', 0.9)
    .append('title')
    .text((d) => `${d.sensor} @ cycle ${d.cycle}: ${d.raw.toFixed(2)}`);

  // Y axis labels
  sensors.forEach((s, i) => {
    g.append('text')
      .attr('x', -6)
      .attr('y', i * cellH + cellH / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#94a3b8')
      .attr('font-size', '0.65rem')
      .text(s.replace('sensor_', 'S'));
  });

  // X axis — sparse labels
  const labelStep = Math.max(1, Math.floor(sampledIndices.length / 10));
  sampledIndices.forEach((idx, col) => {
    if (col % labelStep === 0) {
      g.append('text')
        .attr('x', col * cellW + cellW / 2)
        .attr('y', sensors.length * cellH + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', '0.6rem')
        .text(cycles[idx]);
    }
  });
}
