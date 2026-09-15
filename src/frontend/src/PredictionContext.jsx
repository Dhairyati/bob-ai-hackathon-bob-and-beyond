import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { uploadPredict } from './api';

const PredictionContext = createContext(null);

export function PredictionProvider({ children }) {
  const [predictions, setPredictions] = useState([]);
  const [currentResults, setCurrentResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  // Cached engine detail blobs keyed by detail_id (e.g. "upload_1_26")
  const [engineDetailsCache, setEngineDetailsCache] = useState({});
  // Keep a ref to the latest request so stale responses are ignored
  const requestId = useRef(0);

  const submitPrediction = useCallback(async (file) => {
    const id = ++requestId.current;
    setFileName(file.name);
    setFileSize(file.size);
    setLoading(true);
    setError(null);
    setCurrentResults(null);
    try {
      const res = await uploadPredict(file);
      // Only apply if this is still the latest request
      if (id === requestId.current) {
        setCurrentResults(res);
        setPredictions((prev) => [res, ...prev]);
        // Merge engine details into cache
        if (res.engine_details) {
          setEngineDetailsCache((prev) => ({ ...prev, ...res.engine_details }));
        }
      }
    } catch (e) {
      if (id === requestId.current) {
        setError(e.message);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  const clearPredictions = () => {
    setPredictions([]);
    setEngineDetailsCache({});
  };
  const clearCurrent = () => {
    setCurrentResults(null);
    setError(null);
    setFileName(null);
    setFileSize(null);
  };

  // Lookup a cached engine detail by detail_id
  const getCachedEngineDetail = useCallback((detailId) => {
    return engineDetailsCache[detailId] || null;
  }, [engineDetailsCache]);

  return (
    <PredictionContext.Provider value={{
      predictions, currentResults, loading, error, fileName, fileSize,
      submitPrediction, clearPredictions, clearCurrent, getCachedEngineDetail,
    }}>
      {children}
    </PredictionContext.Provider>
  );
}

export function usePredictions() {
  return useContext(PredictionContext);
}
