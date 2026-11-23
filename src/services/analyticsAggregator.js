import { EventEmitter } from 'events';
import { telemetry } from '../lib/telemetry.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

class HyperLogLog {
  constructor(precision = 12) {
    this.p = precision;
    this.m = 1 << this.p;
    this.registers = new Uint8Array(this.m);
    this.alpha = this._getAlpha(this.m);
  }

  _getAlpha(m) {
    switch (m) {
      case 16: return 0.673;
      case 32: return 0.697;
      case 64: return 0.709;
      default: return 0.7213 / (1 + 1.079 / m);
    }
  }

  _hash(value) {
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }

  _rho(w) {
    let leadingZeros = 1;
    while ((w & 0x80000000) === 0 && leadingZeros <= 32) {
      w <<= 1;
      leadingZeros++;
    }
    return leadingZeros;
  }

  add(value) {
    const hash = this._hash(value);
    const index = hash & (this.m - 1);
    const w = hash << this.p;
    const rank = this._rho(w);
    if (rank > this.registers[index]) {
      this.registers[index] = rank;
    }
  }

  count() {
    let sum = 0;
    for (let i = 0; i < this.m; i++) {
      sum += Math.pow(2, -this.registers[i]);
    }
    let estimate = this.alpha * this.m * this.m / sum;

    const zeros = this.registers.filter(r => r === 0).length;
    if (estimate <= 2.5 * this.m && zeros > 0) {
      estimate = this.m * Math.log(this.m / zeros);
    }

    return Math.round(estimate);
  }

  merge(other) {
    for (let i = 0; i < this.m; i++) {
      this.registers[i] = Math.max(this.registers[i], other.registers[i]);
    }
  }
}

class TimeWindowAggregator {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.buckets = new Map();
    this.currentBucket = null;
    this.currentBucketStart = 0;
  }

  _getBucketKey(timestamp) {
    return Math.floor(timestamp / this.windowMs) * this.windowMs;
  }

  _ensureBucket(timestamp) {
    const bucketKey = this._getBucketKey(timestamp);
    if (this.currentBucketStart !== bucketKey) {
      this.currentBucketStart = bucketKey;
      this.currentBucket = {
        start: bucketKey,
        end: bucketKey + this.windowMs,
        counts: new Map(),
        latencies: [],
        errors: 0,
        total: 0,
        cacheHits: 0,
        cacheMisses: 0,
        featureFlags: new Map(),
        vehicleCrud: { create: 0, read: 0, update: 0, delete: 0 },
        webVitals: { lcp: [], fid: [], cls: [] },
        uniqueUsers: new HyperLogLog(),
        uniqueSessions: new HyperLogLog()
      };
      this.buckets.set(bucketKey, this.currentBucket);
      this._cleanOldBuckets(timestamp);
    }
    return this.currentBucket;
  }

  _cleanOldBuckets(currentTime) {
    const cutoff = currentTime - this.windowMs * 3;
    for (const [key] of this.buckets) {
      if (key < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  recordEvent(event) {
    const bucket = this._ensureBucket(event.timestamp);
    bucket.total++;

    if (event.type === 'error') {
      bucket.errors++;
    }

    if (event.latency !== undefined) {
      bucket.latencies.push(event.latency);
    }

    if (event.cacheHit !== undefined) {
      if (event.cacheHit) bucket.cacheHits++;
      else bucket.cacheMisses++;
    }

    if (event.featureFlag) {
      const flagData = bucket.featureFlags.get(event.featureFlag) || { 
        exposures: 0, 
        conversions: 0,
        variants: new Map()
      };
      flagData.exposures++;
      if (event.conversion) flagData.conversions++;
      if (event.variant) {
        const variantCount = flagData.variants.get(event.variant) || 0;
        flagData.variants.set(event.variant, variantCount + 1);
      }
      bucket.featureFlags.set(event.featureFlag, flagData);
    }

    if (event.vehicleCrudOp) {
      bucket.vehicleCrud[event.vehicleCrudOp]++;
    }

    if (event.webVital) {
      const { name, value } = event.webVital;
      if (bucket.webVitals[name]) {
        bucket.webVitals[name].push(value);
      }
    }

    if (event.userId) {
      bucket.uniqueUsers.add(event.userId);
    }
    if (event.sessionId) {
      bucket.uniqueSessions.add(event.sessionId);
    }

    if (event.metricName) {
      const count = bucket.counts.get(event.metricName) || 0;
      bucket.counts.set(event.metricName, count + 1);
    }
  }

  getAggregatedMetrics() {
    const now = Date.now();
    const buckets = Array.from(this.buckets.values())
      .filter(b => b.start >= now - this.windowMs * 2)
      .sort((a, b) => a.start - b.start);

    if (buckets.length === 0) return this._emptyMetrics();

    let totalEvents = 0;
    let totalErrors = 0;
    const allLatencies = [];
    let totalCacheHits = 0;
    let totalCacheMisses = 0;
    const featureFlagAggregates = new Map();
    const vehicleCrudAggregate = { create: 0, read: 0, update: 0, delete: 0 };
    const webVitalsAggregate = { lcp: [], fid: [], cls: [] };
    const mergedUsers = new HyperLogLog();
    const mergedSessions = new HyperLogLog();
    const metricCounts = new Map();

    for (const bucket of buckets) {
      totalEvents += bucket.total;
      totalErrors += bucket.errors;
      allLatencies.push(...bucket.latencies);
      totalCacheHits += bucket.cacheHits;
      totalCacheMisses += bucket.cacheMisses;

      for (const [flag, data] of bucket.featureFlags) {
        const agg = featureFlagAggregates.get(flag) || { 
          exposures: 0, 
          conversions: 0,
          variants: new Map()
        };
        agg.exposures += data.exposures;
        agg.conversions += data.conversions;
        for (const [variant, count] of data.variants) {
          agg.variants.set(variant, (agg.variants.get(variant) || 0) + count);
        }
        featureFlagAggregates.set(flag, agg);
      }

      vehicleCrudAggregate.create += bucket.vehicleCrud.create;
      vehicleCrudAggregate.read += bucket.vehicleCrud.read;
      vehicleCrudAggregate.update += bucket.vehicleCrud.update;
      vehicleCrudAggregate.delete += bucket.vehicleCrud.delete;

      webVitalsAggregate.lcp.push(...bucket.webVitals.lcp);
      webVitalsAggregate.fid.push(...bucket.webVitals.fid);
      webVitalsAggregate.cls.push(...bucket.webVitals.cls);

      mergedUsers.merge(bucket.uniqueUsers);
      mergedSessions.merge(bucket.uniqueSessions);

      for (const [metric, count] of bucket.counts) {
        metricCounts.set(metric, (metricCounts.get(metric) || 0) + count);
      }
    }

    allLatencies.sort((a, b) => a - b);

    return {
      windowMs: this.windowMs,
      timestamp: now,
      errorRate: totalEvents > 0 ? totalErrors / totalEvents : 0,
      latency: {
        p50: this._percentile(allLatencies, 50),
        p95: this._percentile(allLatencies, 95),
        p99: this._percentile(allLatencies, 99),
        mean: allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0,
        count: allLatencies.length
      },
      cacheHitRatio: (totalCacheHits + totalCacheMisses) > 0 
        ? totalCacheHits / (totalCacheHits + totalCacheMisses) 
        : 0,
      featureFlags: Object.fromEntries(
        Array.from(featureFlagAggregates.entries()).map(([flag, data]) => [
          flag,
          {
            adoptionRate: data.exposures > 0 ? data.conversions / data.exposures : 0,
            exposures: data.exposures,
            conversions: data.conversions,
            variants: Object.fromEntries(data.variants)
          }
        ])
      ),
      vehicleCrudThroughput: {
        ...vehicleCrudAggregate,
        total: vehicleCrudAggregate.create + vehicleCrudAggregate.read + 
               vehicleCrudAggregate.update + vehicleCrudAggregate.delete
      },
      webVitals: {
        lcp: this._percentileSummary(webVitalsAggregate.lcp),
        fid: this._percentileSummary(webVitalsAggregate.fid),
        cls: this._percentileSummary(webVitalsAggregate.cls)
      },
      uniqueUsers: mergedUsers.count(),
      uniqueSessions: mergedSessions.count(),
      customMetrics: Object.fromEntries(metricCounts),
      totalEvents
    };
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const index = Math.ceil(p / 100 * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  _percentileSummary(arr) {
    if (arr.length === 0) return { p50: 0, p75: 0, p95: 0, p99: 0, mean: 0, count: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      p50: this._percentile(sorted, 50),
      p75: this._percentile(sorted, 75),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      count: sorted.length
    };
  }

  _emptyMetrics() {
    return {
      windowMs: this.windowMs,
      timestamp: Date.now(),
      errorRate: 0,
      latency: { p50: 0, p95: 0, p99: 0, mean: 0, count: 0 },
      cacheHitRatio: 0,
      featureFlags: {},
      vehicleCrudThroughput: { create: 0, read: 0, update: 0, delete: 0, total: 0 },
      webVitals: { lcp: { p50: 0, p75: 0, p95: 0, p99: 0, mean: 0, count: 0 }, 
                   fid: { p50: 0, p75: 0, p95: 0, p99: 0, mean: 0, count: 0 }, 
                   cls: { p50: 0, p75: 0, p95: 0, p99: 0, mean: 0, count: 0 } },
      uniqueUsers: 0,
      uniqueSessions: 0,
      customMetrics: {},
      totalEvents: 0
    };
  }
}

export class AnalyticsAggregator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.windows = {
      '1m': new TimeWindowAggregator(60 * 1000),
      '5m': new TimeWindowAggregator(5 * 60 * 1000),
      '15m': new TimeWindowAggregator(15 * 60 * 1000),
      '1h': new TimeWindowAggregator(60 * 60 * 1000)
    };
    this.subscription = null;
    this.wsServer = null;
    this.wsClients = new Set();
    this.pushInterval = options.pushInterval || 5000;
    this.pushTimer = null;
    this.running = false;
  }

  start() {
    if (this.running) return Promise.resolve();
    this.running = true;

    this.subscription = telemetry.subscribe((event) => {
      this._processEvent(event);
    });

    this._startWebSocketServer();
    this._startPushLoop();

    this.emit('started');
    return Promise.resolve();
  }

  stop() {
    if (!this.running) return Promise.resolve();
    this.running = false;

    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    this.wsClients.clear();
    this.emit('stopped');
    return Promise.resolve();
  }

  _processEvent(event) {
    const enrichedEvent = {
      timestamp: event.timestamp || Date.now(),
      type: event.type,
      latency: event.latency,
      cacheHit: event.cacheHit,
      featureFlag: event.featureFlag,
      variant: event.variant,
      conversion: event.conversion,
      vehicleCrudOp: event.vehicleCrudOp,
      webVital: event.webVital,
      userId: event.userId,
      sessionId: event.sessionId,
      metricName: event.metricName
    };

    for (const window of Object.values(this.windows)) {
      window.recordEvent(enrichedEvent);
    }

    this.emit('event', enrichedEvent);
  }

  _startWebSocketServer() {
    const server = createServer();
    this.wsServer = new WebSocketServer({ server });

    this.wsServer.on('connection', (ws, req) => {
      this.wsClients.add(ws);
      ws.isAlive = true;

      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'subscribe') {
            ws.subscriptions = msg.windows || ['1m', '5m', '15m', '1h'];
            ws.metrics = msg.metrics || null;
          }
        } catch (e) {
          // Ignore invalid messages
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
      });

      ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
    });

    const port = process.env.ANALYTICS_WS_PORT || 8081;
    server.listen(port, () => {
      console.log(`Analytics WebSocket server listening on port ${port}`);
    });

    const pingInterval = setInterval(() => {
      for (const ws of this.wsClients) {
        if (!ws.isAlive) {
          this.wsClients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);

    this.wsServer.on('close', () => clearInterval(pingInterval));
  }

  _startPushLoop() {
    this.pushTimer = setInterval(() => {
      this._pushMetrics();
    }, this.pushInterval);
  }

  _pushMetrics() {
    const metrics = this.getMetrics(['1m', '5m', '15m', '1h']);
    const payload = JSON.stringify({
      type: 'metrics',
      timestamp: Date.now(),
      data: metrics
    });

    for (const ws of this.wsClients) {
      if (ws.readyState === 1) {
        try {
          if (ws.subscriptions) {
            const filtered = {};
            for (const window of ws.subscriptions) {
              if (metrics[window]) filtered[window] = metrics[window];
            }
            if (ws.metrics) {
              for (const window of Object.keys(filtered)) {
                const filteredMetrics = {};
                for (const metric of ws.metrics) {
                  if (filtered[window][metric] !== undefined) {
                    filteredMetrics[metric] = filtered[window][metric];
                  }
                }
                filtered[window] = filteredMetrics;
              }
            }
            ws.send(JSON.stringify({ type: 'metrics', timestamp