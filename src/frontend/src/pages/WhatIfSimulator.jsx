import { useEffect, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis, YAxis
} from 'recharts';
import { fetchEngineDetail, fetchFleetStatus, simulateWhatIf } from '../api';
import HealthBadge from '../components/HealthBadge';

export default function WhatIfSimulator() {
  const [engines, setEngines] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [engineData, setEngineData] = useState(null);
  
  const [startCycle, setStartCycle] = useState(1);
  const [altOffset, setAltOffset] = useState(0);
  const [machOffset, setMachOffset] = useState(0);
  const [traOffset, setTraOffset] = useState(0);
  
  const [simHistory, setSimHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    fetchFleetStatus()
      .then(res => {
        // Engine IDs repeat across FD datasets; keep one entry per ID to avoid ambiguous selection.
        const byId = new Map();
        res.engines.forEach((e) => {
          const prev = byId.get(e.engine_id);
          if (!prev || e.rul < prev.rul) byId.set(e.engine_id, e);
        });
        const unique = Array.from(byId.values()).sort((a, b) => parseInt(a.engine_id) - parseInt(b.engine_id));

        setEngines(unique);
        if (unique.length > 0) {
          setSelectedId(unique[0].engine_id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setSimHistory(null);
    fetchEngineDetail(selectedId)
      .then(res => {
        setEngineData(res);
        setStartCycle(Math.max(1, Math.floor(res.cycles / 2))); // default to halfway
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleSimulate = async () => {
    if (!selectedId) return;
    setSimulating(true);
    try {
      const res = await simulateWhatIf(selectedId, {
        start_cycle: startCycle,
        alt_offset: altOffset,
        mach_offset: machOffset,
        tra_offset: traOffset
      });
      setSimHistory(res.simulated_history);
    } catch (e) {
      console.error(e);
      alert('Simulation failed: ' + e.message);
    } finally {
      setSimulating(false);
    }
  };

  const resetSliders = () => {
    setAltOffset(0);
    setMachOffset(0);
    setTraOffset(0);
    if (engineData) setStartCycle(Math.max(1, Math.floor(engineData.cycles / 2)));
    setSimHistory(null);
  };

  if (loading && !engineData) {
    return <div className="loading-container"><div className="loading-spinner" /></div>;
  }

  // Merge original history with simulated history for chart
  let chartData = [];
  if (engineData && engineData.rul_history) {
    const orig = engineData.rul_history;
    if (simHistory) {
      // Create a map of cycles to align them
      const simMap = {};
      simHistory.forEach(h => simMap[h.cycle] = h.rul);
      
      chartData = orig.map(h => ({
        cycle: h.cycle,
        OriginalRUL: h.rul,
        SimulatedRUL: simMap[h.cycle] !== undefined ? simMap[h.cycle] : null,
      }));
    } else {
      chartData = orig.map(h => ({ cycle: h.cycle, OriginalRUL: h.rul }));
    }
  }

  const origFinal = engineData ? engineData.rul : null;
  const simFinal = simHistory && simHistory.length > 0 ? simHistory[simHistory.length - 1].rul : null;
  const diff = simFinal !== null && origFinal !== null ? (simFinal - origFinal).toFixed(1) : null;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>What-If Simulator</h1>
        <p>Inject offsets into operating conditions at a specific cycle to see how the model dynamically adjusts the RUL forecast.</p>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Select Engine</label>
          <select 
            className="sort-select" 
            value={selectedId} 
            onChange={e => setSelectedId(e.target.value)}
            style={{ minWidth: 200 }}
          >
            {engines.map(e => (
              <option key={e.engine_id} value={e.engine_id}>
                Engine #{e.engine_id} — {e.dataset} (RUL: {e.rul.toFixed(0)})
              </option>
            ))}
          </select>
        </div>
        
        {engineData && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Status</div>
              <div><HealthBadge status={engineData.health_status} /></div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Cycles</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{engineData.cycles}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* Sliders Panel */}
        <div className="chart-card">
          <h3 style={{ marginBottom: 20 }}>Simulation Controls</h3>
          
          {engineData && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Start Injection At Cycle:</label>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary-light)' }}>{startCycle}</span>
              </div>
              <input
                type="range"
                min="1"
                max={engineData.cycles}
                value={startCycle}
                onChange={(e) => setStartCycle(parseInt(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                <span>1</span>
                <span>{engineData.cycles}</span>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Altitude Offset (Setting 1):</label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{altOffset > 0 ? '+' : ''}{altOffset}</span>
            </div>
            <input
              type="range"
              min="-0.05" max="0.05" step="0.001"
              value={altOffset}
              onChange={(e) => setAltOffset(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Mach Offset (Setting 2):</label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{machOffset > 0 ? '+' : ''}{machOffset}</span>
            </div>
            <input
              type="range"
              min="-0.5" max="0.5" step="0.01"
              value={machOffset}
              onChange={(e) => setMachOffset(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Throttle/TRA Offset (Setting 3):</label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{traOffset > 0 ? '+' : ''}{traOffset}</span>
            </div>
            <input
              type="range"
              min="-20" max="20" step="1"
              value={traOffset}
              onChange={(e) => setTraOffset(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              className="filter-btn active" 
              onClick={handleSimulate} 
              disabled={simulating}
              style={{ flex: 1, padding: '10px', fontWeight: 600 }}
            >
              {simulating ? 'Inferring...' : 'Run Simulation'}
            </button>
            <button 
              className="filter-btn" 
              onClick={resetSliders}
              style={{ padding: '10px' }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Chart Panel */}
        <div className="chart-card">
          <h3>Simulation Results</h3>
          
          <div style={{ display: 'flex', gap: 24, marginBottom: 20, padding: '16px', background: 'var(--bg-card-hover)', borderRadius: '8px' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Original Final RUL</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                {origFinal !== null ? origFinal.toFixed(1) : '—'}
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Simulated Final RUL</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: simFinal !== null && simFinal < origFinal ? 'var(--color-critical)' : 'var(--color-healthy)' }}>
                {simFinal !== null ? simFinal.toFixed(1) : '—'}
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Delta</div>
              <div style={{ 
                fontSize: '1.4rem', 
                fontWeight: 700, 
                color: diff < 0 ? 'var(--color-critical)' : diff > 0 ? 'var(--color-healthy)' : 'var(--text-primary)'
              }}>
                {diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'} cycles
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="origGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cycle" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 130]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8 }}
              />
              <Legend verticalAlign="top" height={36}/>
              
              <ReferenceLine x={startCycle} stroke="var(--accent-primary-light)" strokeDasharray="3 3" label={{ value: 'Injection', position: 'insideTopLeft', fill: 'var(--accent-primary-light)', fontSize: 11 }} />
              <ReferenceLine y={30} stroke="var(--color-warning)" strokeDasharray="5 5" opacity={0.3} />

              <Area 
                type="monotone" 
                dataKey="OriginalRUL" 
                name="Baseline Forecast"
                stroke="#94a3b8" 
                fill="url(#origGrad)" 
                strokeWidth={2} 
                dot={false} 
              />
              
              {simHistory && (
                <Area 
                  type="monotone" 
                  dataKey="SimulatedRUL" 
                  name="What-If Forecast"
                  stroke="#6366f1" 
                  fill="url(#simGrad)" 
                  strokeWidth={3} 
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
