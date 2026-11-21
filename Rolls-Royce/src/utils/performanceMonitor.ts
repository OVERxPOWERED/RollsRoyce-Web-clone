import { onCLS, onFID, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';
import type { TelemetryEvent, TelemetryEventSchema } from './errors';

interface PerformanceMonitorConfig {
  endpoint: string;
  samplingRate: number;
  consentGiven: boolean;
  debug?: boolean;
}

interface WebVitalMetric extends Metric {
  timestamp: number;
  sessionId: string;
  pageUrl: string;
  userAgent: string;
}

let config: PerformanceMonitorConfig | null = null;
let sessionId: string;
let isInitialized = false;

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function getBaseTelemetryEvent(): Omit<TelemetryEvent, 'eventType' | 'payload'> {
  return {
    timestamp: new Date().toISOString(),
    sessionId,
    environment: import.meta.env.MODE || 'development',
    version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    userId: undefined,
    correlationId: undefined,
  };
}

function mapMetricToTelemetryEvent(metric: WebVitalMetric): TelemetryEvent {
  const baseEvent = getBaseTelemetryEvent();
  
  return {
    ...baseEvent,
    eventType: 'performance_metric',
    payload: {
      metricName: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      entries: metric.entries?.map(entry => ({
        name: entry.name,
        entryType: entry.entryType,
        startTime: entry.startTime,
        duration: entry.duration,
        ...(entry as PerformanceEntry & { value?: number; processingStart?: number; responseStart?: number; requestStart?: number })
      })) || [],
      navigationType: metric.navigationType,
      timestamp: metric.timestamp,
      pageUrl: metric.pageUrl,
      userAgent: metric.userAgent,
    },
  };
}

async function sendTelemetry(event: TelemetryEvent): Promise<void> {
  if (!config || !config.consentGiven) {
    if (config?.debug) {
      console.debug('[PerformanceMonitor] Telemetry skipped: consent not given or not initialized');
    }
    return;
  }

  if (Math.random() > config.samplingRate) {
    if (config.debug) {
      console.debug('[PerformanceMonitor] Telemetry skipped: sampling rate');
    }
    return;
  }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(event),
      keepalive: true,
    });

    if (!response.ok && config.debug) {
      console.warn(`[PerformanceMonitor] Telemetry failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    if (config.debug) {
      console.error('[PerformanceMonitor] Telemetry error:', error);
    }
  }
}

function handleMetric(metric: Metric): void {
  const webVitalMetric: WebVitalMetric = {
    ...metric,
    timestamp: Date.now(),
    sessionId,
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
  };

  const event = mapMetricToTelemetryEvent(webVitalMetric);
  sendTelemetry(event);

  if (config?.debug) {
    console.log(`[PerformanceMonitor] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
  }
}

function registerWebVitalsListeners(): void {
  onCLS(handleMetric);
  onFID(handleMetric);
  onLCP(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);
}

export function initPerformanceMonitoring(options: {
  endpoint: string;
  samplingRate?: number;
  consentGiven: boolean;
  debug?: boolean;
}): void {
  if (isInitialized) {
    console.warn('[PerformanceMonitor] Already initialized');
    return;
  }

  if (!options.consentGiven) {
    console.info('[PerformanceMonitor] Initialization deferred: consent not given');
    return;
  }

  if (typeof window === 'undefined') {
    console.warn('[PerformanceMonitor] Window not available, skipping initialization');
    return;
  }

  sessionId = generateSessionId();
  
  config = {
    endpoint: options.endpoint,
    samplingRate: Math.max(0, Math.min(1, options.samplingRate ?? 1)),
    consentGiven: options.consentGiven,
    debug: options.debug ?? false,
  };

  registerWebVitalsListeners();
  isInitialized = true;

  if (config.debug) {
    console.log('[PerformanceMonitor] Initialized with config:', {
      endpoint: config.endpoint,
      samplingRate: config.samplingRate,
      sessionId,
    });
  }
}

export function updateConsent(consentGiven: boolean): void {
  if (!config) {
    console.warn('[PerformanceMonitor] Cannot update consent: not initialized');
    return;
  }
  
  config.consentGiven = consentGiven;
  
  if (config.debug) {
    console.log('[PerformanceMonitor] Consent updated:', consentGiven);
  }
}

export function getSessionId(): string | undefined {
  return sessionId;
}

export function isMonitoringActive(): boolean {
  return isInitialized && config?.consentGiven === true;
}

export type { PerformanceMonitorConfig, WebVitalMetric };