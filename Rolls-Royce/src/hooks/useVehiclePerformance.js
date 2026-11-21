import { useSyncExternalStore, useCallback, useRef, useEffect } from 'react';
import VehicleService from '@/utils/vehicleService';
import performanceProfiler from '@/utils/performanceProfiler';

const isDevelopment = process.env.NODE_ENV === 'development';
const SAMPLING_RATE = isDevelopment ? 1.0 : 0.1;

const shouldSample = () => Math.random() < SAMPLING_RATE;

const createPerformanceStore = () => {
  let metrics = {
    renders: [],
    asyncOperations: [],
    marks: [],
    measurements: [],
    profileSessions: [],
    startTime: performance.now(),
  };
  const listeners = new Set();

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const getSnapshot = () => metrics;

  const getServerSnapshot = () => metrics;

  const addRenderMetric = (componentName, duration, timestamp = performance.now()) => {
    if (!shouldSample()) return;
    metrics = {
      ...metrics,
      renders: [
        ...metrics.renders.slice(-999),
        { componentName, duration, timestamp, id: crypto.randomUUID() },
      ],
    };
    notify();
  };

  const addAsyncMetric = (operationName, duration, metadata = {}, timestamp = performance.now()) => {
    if (!shouldSample()) return;
    metrics = {
      ...metrics,
      asyncOperations: [
        ...metrics.asyncOperations.slice(-999),
        { operationName, duration, metadata, timestamp, id: crypto.randomUUID() },
      ],
    };
    notify();
  };

  const addMark = (name, timestamp = performance.now()) => {
    if (!shouldSample()) return;
    metrics = {
      ...metrics,
      marks: [...metrics.marks.slice(-499), { name, timestamp, id: crypto.randomUUID() }],
    };
    notify();
  };

  const addMeasurement = (name, startMark, endMark, duration, timestamp = performance.now()) => {
    if (!shouldSample()) return;
    metrics = {
      ...metrics,
      measurements: [
        ...metrics.measurements.slice(-499),
        { name, startMark, endMark, duration, timestamp, id: crypto.randomUUID() },
      ],
    };
    notify();
  };

  const addProfileSession = (session) => {
    metrics = {
      ...metrics,
      profileSessions: [...metrics.profileSessions.slice(-49), session],
    };
    notify();
  };

  const clearMetrics = () => {
    metrics = {
      renders: [],
      asyncOperations: [],
      marks: [],
      measurements: [],
      profileSessions: [],
      startTime: performance.now(),
    };
    notify();
  };

  return {
    subscribe,
    getSnapshot,
    getServerSnapshot,
    addRenderMetric,
    addAsyncMetric,
    addMark,
    addMeasurement,
    addProfileSession,
    clearMetrics,
    getMetrics: () => metrics,
  };
};

const performanceStore = createPerformanceStore();

const devToolsHook =
  typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__
    ? window.__REACT_DEVTOOLS_GLOBAL_HOOK__
    : null;

const useVehiclePerformance = () => {
  const metrics = useSyncExternalStore(
    performanceStore.subscribe,
    performanceStore.getSnapshot,
    performanceStore.getServerSnapshot
  );

  const profilingSessionRef = useRef(null);
  const isProfilingRef = useRef(false);

  const markRender = useCallback((componentName, duration) => {
    performanceStore.addRenderMetric(componentName, duration);
    
    if (devToolsHook && devToolsHook.emit) {
      devToolsHook.emit('mark', `render:${componentName}`, { duration });
    }
  }, []);

  const measureAsync = useCallback(async (operationName, asyncFn, metadata = {}) => {
    const startMark = `${operationName}:start`;
    const endMark = `${operationName}:end`;
    
    performanceStore.addMark(startMark);
    
    const startTime = performance.now();
    try {
      const result = await asyncFn();
      const duration = performance.now() - startTime;
      
      performanceStore.addMark(endMark);
      performanceStore.addMeasurement(operationName, startMark, endMark, duration);
      performanceStore.addAsyncMetric(operationName, duration, metadata);
      
      if (devToolsHook && devToolsHook.emit) {
        devToolsHook.emit('measure', operationName, { duration, metadata });
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      performanceStore.addMark(endMark);
      performanceStore.addMeasurement(operationName, startMark, endMark, duration);
      performanceStore.addAsyncMetric(operationName, duration, { ...metadata, error: true });
      throw error;
    }
  }, []);

  const getMetrics = useCallback(() => {
    return performanceStore.getMetrics();
  }, []);

  const startProfiling = useCallback((sessionName = 'default') => {
    if (isProfilingRef.current) {
      console.warn('[useVehiclePerformance] Profiling already in progress');
      return;
    }

    isProfilingRef.current = true;
    const sessionId = crypto.randomUUID();
    const startTime = performance.now();

    profilingSessionRef.current = {
      id: sessionId,
      name: sessionName,
      startTime,
      marks: [],
      measurements: [],
    };

    if (devToolsHook && devToolsHook.emit) {
      devToolsHook.emit('profile:start', { sessionId, sessionName, startTime });
    }

    performanceProfiler.startSession(sessionName);
  }, []);

  const stopProfiling = useCallback(() => {
    if (!isProfilingRef.current || !profilingSessionRef.current) {
      console.warn('[useVehiclePerformance] No active profiling session');
      return null;
    }

    const endTime = performance.now();
    const session = profilingSessionRef.current;
    const duration = endTime - session.startTime;

    const completedSession = {
      ...session,
      endTime,
      duration,
      metrics: performanceStore.getMetrics(),
    };

    performanceStore.addProfileSession(completedSession);
    performanceProfiler.endSession(session.name);

    if (devToolsHook && devToolsHook.emit) {
      devToolsHook.emit('profile:end', { 
        sessionId: session.id, 
        sessionName: session.name, 
        duration,
        metrics: completedSession.metrics 
      });
    }

    isProfilingRef.current = false;
    profilingSessionRef.current = null;

    return completedSession;
  }, []);

  const clearMetrics = useCallback(() => {
    performanceStore.clearMetrics();
    performanceProfiler.clear();
  }, []);

  useEffect(() => {
    const vehicleMetricsSubscription = VehicleService.onMetricsUpdate((vehicleMetrics) => {
      if (shouldSample()) {
        performanceStore.addAsyncMetric('vehicle:metrics', vehicleMetrics.duration, {
          vehicleId: vehicleMetrics.vehicleId,
          metricType: vehicleMetrics.type,
        });
      }
    });

    return () => {
      vehicleMetricsSubscription.unsubscribe();
    };
  }, []);

  return {
    metrics,
    getMetrics,
    markRender,
    measureAsync,
    startProfiling,
    stopProfiling,
    clearMetrics,
  };
};

export default useVehiclePerformance;