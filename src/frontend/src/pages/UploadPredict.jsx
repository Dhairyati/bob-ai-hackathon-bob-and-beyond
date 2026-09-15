import { CheckCircle, ChevronRight, Download, Loader, Upload, XCircle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HealthBadge from '../components/HealthBadge';
import { usePredictions } from '../PredictionContext';

export default function UploadPredict() {
  const {
    predictions, currentResults, loading, error, fileName, fileSize,
    submitPrediction, clearPredictions, clearCurrent,
  } = usePredictions();
  const [localFile, setLocalFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const displayName = localFile?.name || fileName;
  const displaySize = localFile ? localFile.size : fileSize;

  const handleFile = (f) => {
    setLocalFile(f);
    clearCurrent();
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleSubmit = () => {
    if (!localFile) return;
    submitPrediction(localFile);
    setLocalFile(null);  // clear local ref; context now owns the state
  };

  const downloadCSV = () => {
    if (!currentResults) return;
    const header = 'Engine ID,Cycles,Predicted RUL,Health Status,Confidence Std\n';
    const rows = currentResults.predictions.map(p =>
      `${p.engine_id},${p.cycles},${p.rul},${p.health_status},${p.confidence_std}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rul_predictions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Upload & Predict</h1>
        <p>Upload a C-MAPSS format file to get real-time RUL predictions using ensemble + TTA</p>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        id="upload-zone"
        style={{ marginBottom: 24, opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : 'auto' }}
      >
        <Upload size={40} style={{ color: 'var(--accent-primary-light)', marginBottom: 12 }} />
        <h3>{displayName || 'Drop your C-MAPSS file here'}</h3>
        <p>{displayName
          ? `${(displaySize / 1024).toFixed(1)} KB${loading ? ' — predicting…' : ' — click "Predict" to run'}`
          : 'or click to browse  ·  .txt or .csv  ·  Space-separated, 26 columns'}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          className="filter-btn active"
          onClick={handleSubmit}
          disabled={!localFile || loading}
          id="predict-btn"
          style={{
            padding: '12px 28px',
            fontSize: '0.9rem',
            fontWeight: 600,
            opacity: !localFile || loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading
            ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Running Ensemble + TTA…</>
            : '⚡ Predict RUL'}
        </button>
        {currentResults && (
          <button className="filter-btn" onClick={downloadCSV} id="download-csv-btn">
            <Download size={14} style={{ marginRight: 6 }} /> Download CSV
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="card" style={{ marginBottom: 20, textAlign: 'center', padding: '32px 20px' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            Running predictions on {fileName}…
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 4 }}>
            This may take a minute for large files. Feel free to browse other pages — your prediction will continue.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert-row critical" style={{ marginBottom: 20 }}>
          <XCircle size={18} style={{ color: 'var(--color-critical)' }} />
          <span className="alert-message">{error}</span>
        </div>
      )}

      {/* Current Results */}
      {currentResults && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <CheckCircle size={20} style={{ color: 'var(--color-healthy)' }} />
              <span style={{ fontWeight: 600 }}>
                {currentResults.total_engines} engines predicted from {currentResults.filename}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Click any engine row to view detailed sensor graphs, degradation curves, and attention weights
            </p>
          </div>

          {_renderPredictionTable(currentResults.predictions, navigate)}
        </div>
      )}

      {/* Previous predictions (persisted across navigation) */}
      {predictions.length > (currentResults ? 1 : 0) && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Prediction History</h3>
            <button className="filter-btn" onClick={clearPredictions} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
              Clear History
            </button>
          </div>
          {predictions.slice(currentResults ? 1 : 0).map((pred, idx) => (
            <div key={idx} className="fade-in" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
                {pred.filename} — {pred.total_engines} engines
              </div>
              {_renderPredictionTable(pred.predictions, navigate)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function _renderPredictionTable(preds, navigate) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="results-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>Cycles</th>
            <th>Predicted RUL</th>
            <th>Health</th>
            <th>Confidence ±</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {[...preds]
            .sort((a, b) => a.rul - b.rul)
            .map((p) => (
              <tr
                key={p.engine_id}
                onClick={() => p.detail_id && navigate(`/engine/${p.detail_id}`)}
                style={{ cursor: p.detail_id ? 'pointer' : 'default' }}
                className={p.detail_id ? 'clickable-row' : ''}
              >
                <td style={{ fontWeight: 600 }}>{p.engine_id}</td>
                <td>{p.cycles}</td>
                <td style={{
                  fontWeight: 700,
                  fontFamily: 'Outfit',
                  color: p.rul > 60 ? 'var(--color-healthy)' : p.rul > 30 ? 'var(--color-warning)' : 'var(--color-critical)',
                }}>
                  {p.rul.toFixed(1)}
                </td>
                <td><HealthBadge status={p.health_status} /></td>
                <td style={{ color: 'var(--text-muted)' }}>±{p.confidence_std.toFixed(1)}</td>
                <td>{p.detail_id && <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
