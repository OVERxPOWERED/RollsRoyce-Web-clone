/**
 * @file PerformanceProfiler - High-resolution timing and memory tracking for hot path instrumentation
 * @module utils/performanceProfiler
 */

/**
 * @typedef {Object} MetricEntry
 * @property {string} label - Timer label/identifier
 * @property {number} startTime - High-resolution start timestamp (ms)
 * @property {number} endTime - High-resolution end timestamp (ms)
 * @property {number} durationMs - Duration in milliseconds
 * @property {number} memoryStart - Memory usage at start (bytes)
 * @property {number} memoryEnd - Memory usage at end (bytes)
 * @property {number} memoryDelta - Memory delta (bytes)
 * @property {number} timestamp - Unix timestamp when measurement completed
 */

/**
 * @typedef {Object} AggregatedMetrics
 * @property {string} label - Timer label
 * @property {number} count - Number of measurements
 * @property {number} min - Minimum duration (ms)
 * @property {number} max - Maximum duration (ms)
 * @property {number} mean - Mean duration (ms)
 * @property {number} p50 - 50th percentile (median) duration (ms)
 * @property {number} p95 - 95th percentile duration (ms)
 * @property {number} p99 - 99th percentile duration (ms)
 * @property {number} stdDev - Standard deviation (ms)
 * @property {number} totalMemoryDelta - Total memory delta across all runs (bytes)
 * @property {number} avgMemoryDelta - Average memory delta per run (bytes)
 * @property {number} lastUpdated - Unix timestamp of last update
 */

/**
 * @typedef {Object} TimerState
 * @property {number} startTime
 * @property {number} memoryStart
 */

class PerformanceProfiler {
  #timers = new Map();
  #metrics = new Map();
  #enabled = true;
  #maxEntriesPerLabel = 10000;

  /**
   * Check if performance.memory is available
   * @returns {boolean}
   */
  #hasMemoryAPI() {
    return typeof performance !== 'undefined' && 
           performance.memory !== undefined &&
           typeof performance.memory.usedJSHeapSize === 'number';
  }

  /**
   * Get current memory usage in bytes
   * @returns {number}
   */
  #getMemoryUsage() {
    if (this.#hasMemoryAPI()) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Calculate percentile from sorted array
   * @param {number[]} sortedValues - Pre-sorted array of values
   * @param {number} percentile - Percentile (0-100)
   * @returns {number}
   */
  #calculatePercentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];
    
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sortedValues[lower];
    
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Calculate standard deviation
   * @param {number[]} values - Array of values
   * @param {number} mean - Pre-calculated mean
   * @returns {number}
   */
  #calculateStdDev(values, mean) {
    if (values.length <= 1) return 0;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Start a named timer
   * @param {string} label - Unique identifier for the timer
   * @returns {void}
   * @throws {Error} If timer with label already exists
   */
  startTimer(label) {
    if (!this.#enabled) return;
    
    if (this.#timers.has(label)) {
      throw new Error(`Timer "${label}" already started. Call endTimer() first.`);
    }

    const state = {
      startTime: performance.now(),
      memoryStart: this.#getMemoryUsage()
    };

    this.#timers.set(label, state);
  }

  /**
   * Stop a named timer and record metrics
   * @param {string} label - Timer label to stop
   * @returns {{durationMs: number, memoryDelta: number} | null} Duration and memory delta, or null if timer not found
   */
  endTimer(label) {
    if (!this.#enabled) return null;
    
    const state = this.#timers.get(label);
    if (!state) {
      console.warn(`[PerformanceProfiler] Timer "${label}" not found`);
      return null;
    }

    const endTime = performance.now();
    const memoryEnd = this.#getMemoryUsage();
    
    const durationMs = endTime - state.startTime;
    const memoryDelta = memoryEnd - state.memoryStart;

    const entry = {
      label,
      startTime: state.startTime,
      endTime,
      durationMs,
      memoryStart: state.memoryStart,
      memoryEnd,
      memoryDelta,
      timestamp: Date.now()
    };

    this.#recordMetric(entry);
    this.#timers.delete(label);

    return { durationMs, memoryDelta };
  }

  /**
   * Record a metric entry
   * @param {MetricEntry} entry - Metric entry to record
   * @private
   */
  #recordMetric(entry) {
    const existing = this.#metrics.get(entry.label) || [];
    existing.push(entry);
    
    // Trim to max entries to prevent memory leaks
    if (existing.length > this.#maxEntriesPerLabel) {
      existing.splice(0, existing.length - this.#maxEntriesPerLabel);
    }
    
    this.#metrics.set(entry.label, existing);
  }

  /**
   * Get aggregated metrics for all labels or a specific label
   * @param {string} [label] - Optional label to filter by
   * @returns {AggregatedMetrics[] | AggregatedMetrics | null}
   */
  getMetrics(label) {
    if (label) {
      const entries = this.#metrics.get(label);
      if (!entries || entries.length === 0) return null;
      return this.#aggregateEntries(label, entries);
    }

    const results = [];
    for (const [lbl, entries] of this.#metrics.entries()) {
      if (entries.length > 0) {
        results.push(this.#aggregateEntries(lbl, entries));
      }
    }
    return results;
  }

  /**
   * Aggregate raw entries into statistical metrics
   * @param {string} label - Timer label
   * @param {MetricEntry[]} entries - Raw metric entries
   * @returns {AggregatedMetrics}
   * @private
   */
  #aggregateEntries(label, entries) {
    const durations = entries.map(e => e.durationMs).sort((a, b) => a - b);
    const memoryDeltas = entries.map(e => e.memoryDelta);
    
    const count = durations.length;
    const min = durations[0];
    const max = durations[count - 1];
    const sum = durations.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    
    const totalMemoryDelta = memoryDeltas.reduce((a, b) => a + b, 0);
    const avgMemoryDelta = totalMemoryDelta / count;

    return {
      label,
      count,
      min,
      max,
      mean,
      p50: this.#calculatePercentile(durations, 50),
      p95: this.#calculatePercentile(durations, 95),
      p99: this.#calculatePercentile(durations, 99),
      stdDev: this.#calculateStdDev(durations, mean),
      totalMemoryDelta,
      avgMemoryDelta,
      lastUpdated: entries[entries.length - 1].timestamp
    };
  }

  /**
   * Reset all metrics and timers
   * @returns {void}
   */
  reset() {
    this.#timers.clear();
    this.#metrics.clear();
  }

  /**
   * Clear metrics for a specific label
   * @param {string} label - Label to clear
   * @returns {boolean} True if label existed and was cleared
   */
  clear(label) {
    const timerDeleted = this.#timers.delete(label);
    const metricsDeleted = this.#metrics.delete(label);
    return timerDeleted || metricsDeleted;
  }

  /**
   * Enable or disable profiling
   * @param {boolean} enabled - Whether profiling is enabled
   * @returns {void}
   */
  setEnabled(enabled) {
    this.#enabled = enabled;
    if (!enabled) {
      this.#timers.clear();
    }
  }

  /**
   * Check if profiling is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.#enabled;
  }

  /**
   * Export metrics as JSON-serializable object
   * @param {string} [label] - Optional label to filter by
   * @returns {Object}
   */
  export(label) {
    const metrics = this.getMetrics(label);
    return {
      timestamp: Date.now(),
      enabled: this.#enabled,
      metrics: Array.isArray(metrics) ? metrics : [metrics].filter(Boolean)
    };
  }

  /**
   * Get raw entries for a label (for custom analysis)
   * @param {string} label - Timer label
   * @returns {MetricEntry[] | null}
   */
  getRawEntries(label) {
    const entries = this.#metrics.get(label);
    return entries ? [...entries] : null;
  }

  /**
   * Set maximum entries per label (memory management)
   * @param {number} max - Maximum entries to retain per label
   * @returns {void}
   */
  setMaxEntriesPerLabel(max) {
    if (max < 1) throw new Error('Max entries must be at least 1');
    this.#maxEntriesPerLabel = max;
    
    // Trim existing metrics if needed
    for (const [label, entries] of this.#metrics.entries()) {
      if (entries.length > max) {
        entries.splice(0, entries.length - max);
      }
    }
  }
}

// Export singleton instance
const performanceProfiler = new PerformanceProfiler();

export { PerformanceProfiler, performanceProfiler };
export default performanceProfiler;