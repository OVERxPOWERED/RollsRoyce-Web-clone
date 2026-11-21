import { serializeError } from '../utils/errors.js';

class Telemetry {
  constructor(config = {}) {
    this.endpoint = config.endpoint || '/api/telemetry';
    this.samplingRate = config.samplingRate ?? 1.0;
    this.maxBatchSize = config.maxBatchSize ?? 10;
    this.flushInterval = config.flushInterval ?? 5000;
    this.queue = [];
    this.flushTimer = null;
    this.isPageHidden = false;
    this.sessionId = this.generateSessionId();
    this.userId = config.userId || null;
    this.metadata = config.metadata || {};

    this.initVisibilityHandler();
    this.startFlushTimer();
  }

  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  initVisibilityHandler() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isPageHidden = document.hidden;
        if (this.isPageHidden) {
          this.flush();
        }
      });

      window.addEventListener('beforeunload', () => {
        this.flush(true);
      });
    }
  }

  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  shouldSample() {
    return Math.random() < this.samplingRate;
  }

  enqueue(event) {
    if (!this.shouldSample()) return;

    const enrichedEvent = {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      ...this.metadata
    };

    this.queue.push(enrichedEvent);

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  async send(batch, useBeacon = false) {
    const payload = JSON.stringify(batch);

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      return navigator.sendBeacon(this.endpoint, blob);
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        keepalive: true
      });
      return response.ok;
    } catch (error) {
      console.error('[Telemetry] Failed to send batch:', error);
      return false;
    }
  }

  async flush(forceBeacon = false) {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.maxBatchSize);
    const useBeacon = forceBeacon || this.isPageHidden;

    const success = await this.send(batch, useBeacon);

    if (!success && !useBeacon) {
      this.queue.unshift(...batch);
    }
  }

  trackError(error, context = {}) {
    const serializedError = serializeError(error);
    this.enqueue({
      type: 'error',
      name: serializedError.name,
      message: serializedError.message,
      stack: serializedError.stack,
      code: serializedError.code,
      context: {
        ...context,
        componentStack: serializedError.componentStack
      }
    });
  }

  trackEvent(name, properties = {}) {
    this.enqueue({
      type: 'event',
      name,
      properties
    });
  }

  trackPerformance(name, duration, metadata = {}) {
    this.enqueue({
      type: 'performance',
      name,
      duration,
      metadata
    });
  }

  trackWebVital(metric) {
    this.trackPerformance(`web-vital-${metric.name}`, metric.value, {
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType
    });
  }

  setUserId(userId) {
    this.userId = userId;
  }

  setMetadata(metadata) {
    this.metadata = { ...this.metadata, ...metadata };
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(true);
  }
}

let telemetryInstance = null;

export function initTelemetry(config) {
  if (!telemetryInstance) {
    telemetryInstance = new Telemetry(config);
  }
  return telemetryInstance;
}

export function getTelemetry() {
  if (!telemetryInstance) {
    telemetryInstance = new Telemetry();
  }
  return telemetryInstance;
}

export const telemetry = getTelemetry();

export default telemetry;