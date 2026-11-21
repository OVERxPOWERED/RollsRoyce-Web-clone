import { useState, useEffect, useRef, useCallback } from 'react';
import vehicleService from '../utils/vehicleService';

export function useVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVehicles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await vehicleService.getAllVehicles();
      setVehicles(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const createVehicle = useCallback(async (vehicleData) => {
    const newVehicle = await vehicleService.createVehicle(vehicleData);
    setVehicles(prev => [...prev, newVehicle]);
    return newVehicle;
  }, []);

  const updateVehicle = useCallback(async (id, vehicleData) => {
    const updated = await vehicleService.updateVehicle(id, vehicleData);
    setVehicles(prev => prev.map(v => v.id === id ? updated : v));
    return updated;
  }, []);

  const deleteVehicle = useCallback(async (id) => {
    await vehicleService.deleteVehicle(id);
    setVehicles(prev => prev.filter(v => v.id !== id));
  }, []);

  return {
    vehicles,
    loading,
    error,
    refetch: fetchVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  };
}

export function useVehiclesPerformance(intervalMs = 30000) {
  const [metrics, setMetrics] = useState(null);
  const [isProfiling, setIsProfiling] = useState(false);
  const [error, setError] = useState(null);
  
  const metricsRef = useRef(null);
  const intervalRef = useRef(null);
  const devtoolsHookRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      devtoolsHookRef.current = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      
      if (devtoolsHookRef.current.onCommitFiberRoot) {
        const originalOnCommit = devtoolsHookRef.current.onCommitFiberRoot;
        devtoolsHookRef.current.onCommitFiberRoot = (...args) => {
          if (metricsRef.current) {
            devtoolsHookRef.current.emit('rolls-royce:performance-metrics', metricsRef.current);
          }
          return originalOnCommit.apply(devtoolsHookRef.current, args);
        };
      }
    }

    return () => {
      if (devtoolsHookRef.current && devtoolsHookRef.current.onCommitFiberRoot) {
        devtoolsHookRef.current.onCommitFiberRoot = originalOnCommit;
      }
    };
  }, []);

  const pollMetrics = useCallback(async () => {
    try {
      const data = await vehicleService.getPerformanceMetrics();
      metricsRef.current = data;
      setMetrics(data);
      setError(null);
      
      if (devtoolsHookRef.current) {
        devtoolsHookRef.current.emit('rolls-royce:performance-metrics', data);
      }
    } catch (err) {
      setError(err.message);
      console.error('[useVehiclesPerformance] Failed to fetch metrics:', err);
    }
  }, []);

  const startProfiling = useCallback(() => {
    if (isProfiling) return;
    
    setIsProfiling(true);
    setError(null);
    
    pollMetrics();
    
    intervalRef.current = setInterval(pollMetrics, intervalMs);
  }, [isProfiling, intervalMs, pollMetrics]);

  const stopProfiling = useCallback(() => {
    if (!isProfiling) return;
    
    setIsProfiling(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isProfiling]);

  useEffect(() => {
    if (isProfiling) {
      startProfiling();
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isProfiling, startProfiling]);

  const resetMetrics = useCallback(() => {
    metricsRef.current = null;
    setMetrics(null);
    setError(null);
  }, []);

  return {
    metrics,
    isProfiling,
    error,
    startProfiling,
    stopProfiling,
    resetMetrics,
  };
}