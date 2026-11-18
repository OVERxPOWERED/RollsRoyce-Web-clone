import { useEffect, useCallback, useRef } from 'react';
import telemetry from '../utils/telemetry';

export function useTelemetry(componentName) {
  const componentNameRef = useRef(componentName);
  componentNameRef.current = componentName;

  const trackError = useCallback((error, context = {}) => {
    telemetry.trackError(error, {
      ...context,
      component: componentNameRef.current,
    });
  }, []);

  const trackEvent = useCallback((eventName, properties = {}) => {
    telemetry.trackEvent(eventName, {
      ...properties,
      component: componentNameRef.current,
    });
  }, []);

  const trackPerformance = useCallback((metricName, value, unit = 'ms') => {
    telemetry.trackPerformance(metricName, value, unit, {
      component: componentNameRef.current,
    });
  }, []);

  const trackComponentMount = useCallback(() => {
    telemetry.trackEvent('component_mount', {
      component: componentNameRef.current,
    });
  }, []);

  const trackComponentUnmount = useCallback(() => {
    telemetry.trackEvent('component_unmount', {
      component: componentNameRef.current,
    });
  }, []);

  useEffect(() => {
    trackComponentMount();
    return () => {
      trackComponentUnmount();
    };
  }, [trackComponentMount, trackComponentUnmount]);

  return {
    trackError,
    trackEvent,
    trackPerformance,
    trackComponentMount,
    trackComponentUnmount,
  };
}

export function useTrackedCallback(callback, options = {}) {
  const { componentName, trackErrors = true, trackPerformance = true } = options;
  const telemetryApi = useTelemetry(componentName);

  return useCallback(
    async (...args) => {
      const startTime = performance.now();
      try {
        const result = await callback(...args);
        if (trackPerformance) {
          const duration = performance.now() - startTime;
          telemetryApi.trackPerformance('callback_duration', duration);
        }
        return result;
      } catch (error) {
        if (trackErrors) {
          telemetryApi.trackError(error, { callback: callback.name });
        }
        throw error;
      }
    },
    [callback, telemetryApi, trackErrors, trackPerformance]
  );
}

export default useTelemetry;