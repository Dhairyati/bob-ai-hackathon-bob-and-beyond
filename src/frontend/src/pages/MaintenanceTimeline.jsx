import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { fetchTimeline, scheduleMaintenance, deleteMaintenance } from '../api';

const MAINT_TYPES = ['Inspection', 'Repair', 'Overhaul'];
const MAINT_COLORS = {
  Inspection: '#3b82f6',
  Repair: '#8b5cf6',
  Overhaul: '#ec4899',
};

const ROW_HEIGHT = 38;
const ROW_GAP = 4;
const MARGIN = { top: 50, right: 30, bottom: 40, left: 100 };

export default function MaintenanceTimeline() {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('critical'); // 'all' | 'critical' | 'warning'
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  const loadData = useCallback(() => {
    fetchTimeline()
      .then(data => {
        setTimeline(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter engines
  const filtered = timeline.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'critical') return e.health_status === 'Critical' || e.health_status === 'Warning';
    if (filter === 'warning') return e.health_status === 'Warning';
    return e.health_status === filter;
  }).sort((a, b) => a.rul - b.rul).slice(0, 40);

  // D3 Gantt rendering
  useEffect(() => {
    if (!svgRef.current || filtered.length === 0) return;

    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll('*').remove();

    const width = svgRef.current.parentElement.clientWidth;
    const chartHeight = filtered.length * (ROW_HEIGHT + ROW_GAP) + MARGIN.top + MARGIN.bottom;

    svgEl.attr('width', width).attr('height', chartHeight);

    // Compute global X domain: 0 to max(predicted_failure_cycle)
    const maxCycle = d3.max(filtered, d => d.predicted_failure_cycle) || 500;
    const xScale = d3.scaleLinear()
      .domain([0, maxCycle * 1.05])
      .range([MARGIN.left, width - MARGIN.right]);

    // Y scale
    const yScale = d3.scaleBand()
      .domain(filtered.map(d => d.engine_id))
      .range([MARGIN.top, chartHeight - MARGIN.bottom])
      .padding(0.15);

    const g = svgEl.append('g');

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${MARGIN.top - 10})`)
      .call(d3.axisTop(xScale).ticks(10).tickFormat(d => `${d}`))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', 'rgba(255,255,255,0.06)').attr('y2', chartHeight - MARGIN.top - MARGIN.bottom + 10).attr('stroke-dasharray', '2,4'))
      .call(g => g.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', '10px'));

    // X axis label
    g.append('text')
      .attr('x', (MARGIN.left + width - MARGIN.right) / 2)
      .attr('y', chartHeight - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .text('Cycles');

    // Y Axis labels
    g.append('g')
      .attr('transform', `translate(${MARGIN.left - 8},0)`)
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text')
        .attr('fill', '#94a3b8')
        .attr('font-size', '11px')
        .attr('font-weight', 500)
        .text(d => `#${d}`));

    // Tooltip div
    const tooltip = d3.select(tooltipRef.current);

    // Rows
    const rows = g.selectAll('.timeline-row')
      .data(filtered)
      .join('g')
      .attr('class', 'timeline-row');

    // Row background (interactive — click to schedule)
    rows.append('rect')
      .attr('x', MARGIN.left)
      .attr('y', d => yScale(d.engine_id))
      .attr('width', width - MARGIN.left - MARGIN.right)
      .attr('height', yScale.bandwidth())
      .attr('rx', 4)
      .attr('fill', 'rgba(255,255,255,0.015)')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        const [mx] = d3.pointer(event, svgEl.node());
        const clickedCycle = Math.round(xScale.invert(mx));
        setModalData({
          engine_id: d.engine_id,
          start_cycle: Math.max(1, clickedCycle - 5),
          end_cycle: clickedCycle + 5,
          type: 'Inspection',
          notes: '',
          max_cycle: d.predicted_failure_cycle,
        });
        setShowModal(true);
      });

    // Elapsed life bar (grey)
    rows.append('rect')
      .attr('x', d => xScale(0))
      .attr('y', d => yScale(d.engine_id) + yScale.bandwidth() * 0.2)
      .attr('width', d => Math.max(0, xScale(d.current_cycle) - xScale(0)))
      .attr('height', yScale.bandwidth() * 0.6)
      .attr('rx', 3)
      .attr('fill', 'rgba(148, 163, 184, 0.25)')
      .attr('pointer-events', 'none');

    // Remaining life bar (green→yellow→red gradient based on RUL)
    rows.append('rect')
      .attr('x', d => xScale(d.current_cycle))
      .attr('y', d => yScale(d.engine_id) + yScale.bandwidth() * 0.2)
      .attr('width', d => Math.max(0, xScale(d.predicted_failure_cycle) - xScale(d.current_cycle)))
      .attr('height', yScale.bandwidth() * 0.6)
      .attr('rx', 3)
      .attr('fill', d => {
        if (d.rul < 15) return 'rgba(239, 68, 68, 0.35)';
        if (d.rul < 30) return 'rgba(245, 158, 11, 0.30)';
        if (d.rul < 60) return 'rgba(245, 158, 11, 0.20)';
        return 'rgba(34, 197, 94, 0.20)';
      })
      .attr('pointer-events', 'none');

    // Predicted failure line (red dashed)
    rows.append('line')
      .attr('x1', d => xScale(d.predicted_failure_cycle))
      .attr('x2', d => xScale(d.predicted_failure_cycle))
      .attr('y1', d => yScale(d.engine_id) + 2)
      .attr('y2', d => yScale(d.engine_id) + yScale.bandwidth() - 2)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,3')
      .attr('pointer-events', 'none');

    // Current cycle marker
    rows.append('circle')
      .attr('cx', d => xScale(d.current_cycle))
      .attr('cy', d => yScale(d.engine_id) + yScale.bandwidth() / 2)
      .attr('r', 4)
      .attr('fill', '#f1f5f9')
      .attr('stroke', '#0c1020')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    // RUL label at the end of remaining life bar
    rows.append('text')
      .attr('x', d => xScale(d.predicted_failure_cycle) + 6)
      .attr('y', d => yScale(d.engine_id) + yScale.bandwidth() / 2 + 4)
      .attr('fill', d => {
        if (d.rul < 15) return '#ef4444';
        if (d.rul < 30) return '#f59e0b';
        return '#64748b';
      })
      .attr('font-size', '9px')
      .attr('font-weight', 600)
      .text(d => `${Math.round(d.rul)}`);

    // Maintenance blocks
    filtered.forEach(eng => {
      if (!eng.maintenance || eng.maintenance.length === 0) return;

      g.selectAll(`.maint-block-${eng.engine_id}`)
        .data(eng.maintenance)
        .join('rect')
        .attr('class', `maint-block-${eng.engine_id}`)
        .attr('x', d => xScale(d.start_cycle))
        .attr('y', yScale(eng.engine_id) + yScale.bandwidth() * 0.05)
        .attr('width', d => Math.max(4, xScale(d.end_cycle) - xScale(d.start_cycle)))
        .attr('height', yScale.bandwidth() * 0.9)
        .attr('rx', 4)
        .attr('fill', d => MAINT_COLORS[d.type] || '#6366f1')
        .attr('opacity', 0.55)
        .attr('stroke', d => MAINT_COLORS[d.type] || '#6366f1')
        .attr('stroke-width', 1.5)
        .attr('cursor', 'pointer')
        .on('mouseenter', (event, d) => {
          tooltip
            .style('display', 'block')
            .style('left', `${event.pageX + 12}px`)
            .style('top', `${event.pageY - 40}px`)
            .html(`
              <strong>${d.type}</strong><br/>
              Engine #${eng.engine_id}<br/>
              Cycles ${d.start_cycle} → ${d.end_cycle}<br/>
              <span style="color:#64748b">${d.notes || ''}</span>
            `);
        })
        .on('mousemove', (event) => {
          tooltip
            .style('left', `${event.pageX + 12}px`)
            .style('top', `${event.pageY - 40}px`);
        })
        .on('mouseleave', () => {
          tooltip.style('display', 'none');
        })
        .on('click', (event, d) => {
          event.stopPropagation();
          setSelectedBlock({ ...d, engine_id: eng.engine_id });
        });
    });

  }, [filtered]);

  // Schedule handler
  const handleSchedule = async () => {
    if (!modalData) return;
    try {
      await scheduleMaintenance({
        engine_id: modalData.engine_id,
        start_cycle: modalData.start_cycle,
        end_cycle: modalData.end_cycle,
        type: modalData.type,
        notes: modalData.notes,
      });
      setShowModal(false);
      setModalData(null);
      loadData();
    } catch (e) {
      alert('Failed to schedule: ' + e.message);
    }
  };

  // Delete handler
  const handleDelete = async (blockId) => {
    try {
      await deleteMaintenance(blockId);
      setSelectedBlock(null);
      loadData();
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner" /></div>;
  }

  // Stats
  const totalScheduled = timeline.reduce((sum, e) => sum + (e.maintenance?.length || 0), 0);
  const criticalCount = timeline.filter(e => e.health_status === 'Critical').length;
  const warningCount = timeline.filter(e => e.health_status === 'Warning').length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Maintenance Timeline</h1>
        <p>Fleet-wide Gantt chart — visualize engine lifecycles, predicted failures, and scheduled maintenance.</p>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-icon accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div className="stat-value">{totalScheduled}</div>
            <div className="stat-label">Scheduled Tasks</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon critical">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <div className="stat-value">{criticalCount}</div>
            <div className="stat-label">Critical Engines</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div className="stat-value">{warningCount}</div>
            <div className="stat-label">Warning Engines</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon healthy">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div>
            <div className="stat-value">{timeline.length}</div>
            <div className="stat-label">Total Fleet</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls-bar">
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Show:</span>
        {['critical', 'all'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'critical' ? 'Critical & Warning' : 'All Engines'}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>LEGEND:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 10, borderRadius: 2, background: 'rgba(148,163,184,0.25)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Elapsed Life</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 10, borderRadius: 2, background: 'rgba(34,197,94,0.20)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Remaining Life</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 14, borderLeft: '2px dashed #ef4444' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Predicted Failure</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f1f5f9', border: '1.5px solid #0c1020' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Current Cycle</span>
        </div>
        {MAINT_TYPES.map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 24, height: 10, borderRadius: 3, background: MAINT_COLORS[t], opacity: 0.55, border: `1px solid ${MAINT_COLORS[t]}` }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="chart-card" style={{ position: 'relative', overflow: 'auto' }}>
        <h3 style={{ marginBottom: 8 }}>Fleet Lifecycle & Maintenance Schedule</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Click on an engine's track to schedule maintenance. Click a maintenance block to view details.
        </p>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No engines match the selected filter.
          </div>
        ) : (
          <svg ref={svgRef} style={{ display: 'block' }} />
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'fixed',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: '0.8rem',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-card)',
          zIndex: 1000,
          pointerEvents: 'none',
          backdropFilter: 'blur(16px)',
          lineHeight: 1.5,
        }}
      />

      {/* Schedule Modal */}
      {showModal && modalData && (
        <div className="timeline-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="timeline-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16, fontSize: '1.1rem' }}>Schedule Maintenance</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
              Engine <strong>#{modalData.engine_id}</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Start Cycle</label>
                <input
                  type="number"
                  className="search-input"
                  style={{ width: '100%' }}
                  value={modalData.start_cycle}
                  min={1}
                  max={modalData.max_cycle}
                  onChange={e => setModalData({ ...modalData, start_cycle: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>End Cycle</label>
                <input
                  type="number"
                  className="search-input"
                  style={{ width: '100%' }}
                  value={modalData.end_cycle}
                  min={modalData.start_cycle + 1}
                  max={modalData.max_cycle}
                  onChange={e => setModalData({ ...modalData, end_cycle: parseInt(e.target.value) || modalData.start_cycle + 1 })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Type</label>
              <select
                className="sort-select"
                style={{ width: '100%' }}
                value={modalData.type}
                onChange={e => setModalData({ ...modalData, type: e.target.value })}
              >
                {MAINT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notes</label>
              <input
                className="search-input"
                style={{ width: '100%' }}
                placeholder="Optional notes..."
                value={modalData.notes}
                onChange={e => setModalData({ ...modalData, notes: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="filter-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="filter-btn active" onClick={handleSchedule} style={{ fontWeight: 600 }}>
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Detail Popover */}
      {selectedBlock && (
        <div className="timeline-modal-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="timeline-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 style={{ marginBottom: 14, fontSize: '1.05rem' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: MAINT_COLORS[selectedBlock.type] || '#6366f1', marginRight: 8 }} />
              {selectedBlock.type}
            </h3>
            <div style={{ fontSize: '0.85rem', lineHeight: 2 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Engine:</span> #{selectedBlock.engine_id}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Cycle Range:</span> {selectedBlock.start_cycle} → {selectedBlock.end_cycle}</div>
              {selectedBlock.notes && (
                <div><span style={{ color: 'var(--text-muted)' }}>Notes:</span> {selectedBlock.notes}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="filter-btn" onClick={() => setSelectedBlock(null)}>Close</button>
              <button
                className="filter-btn"
                style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }}
                onClick={() => handleDelete(selectedBlock.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
