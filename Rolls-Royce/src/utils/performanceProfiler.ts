export interface ProfilerMetrics {
  label: string;
  duration: number;
  memoryDelta: number;
  timestamp: number;
  startMemory: number;
  endMemory: number;
}

export interface ProfileEntry {
  label: string;
  startTime: number;
  startMemory: number;
  endTime?: number;
  endMemory?: number;
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler;
  private profiles: Map<string, ProfileEntry> = new Map();
  private metrics: ProfilerMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  private constructor() {}

  static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  static resetInstance(): void {
    PerformanceProfiler.instance = new PerformanceProfiler();
  }

  startProfile(label: string): void {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    this.profiles.set(label, {
      label,
      startTime,
      startMemory,
    });

    if (import.meta.env.DEV) {
      console.debug(`[Profiler] Started: ${label}`, { startTime, startMemory });
    }
  }

  endProfile(label: string): ProfilerMetrics | null {
    const profile = this.profiles.get(label);
    if (!profile) {
      if (import.meta.env.DEV) {
        console.warn(`[Profiler] No active profile found for label: ${label}`);
      }
      return null;
    }

    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const duration = endTime - profile.startTime;
    const memoryDelta = endMemory - profile.startMemory;

    const metrics: ProfilerMetrics = {
      label,
      duration,
      memoryDelta,
      timestamp: Date.now(),
      startMemory: profile.startMemory,
      endMemory,
    };

    this.metrics.push(metrics);
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    this.profiles.delete(label);

    if (import.meta.env.DEV) {
      console.debug(`[Profiler] Completed: ${label}`, {
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: `${this.formatBytes(memoryDelta)}`,
        timestamp: metrics.timestamp,
      });
    }

    return metrics;
  }

  getMetrics(label?: string): ProfilerMetrics[] {
    if (label) {
      return this.metrics.filter((m) => m.label === label);
    }
    return [...this.metrics];
  }

  getLatestMetrics(label: string): ProfilerMetrics | undefined {
    const filtered = this.metrics.filter((m) => m.label === label);
    return filtered[filtered.length - 1];
  }

  getAverageMetrics(label: string): { avgDuration: number; avgMemoryDelta: number; count: number } | null {
    const filtered = this.metrics.filter((m) => m.label === label);
    if (filtered.length === 0) return null;

    const sum = filtered.reduce(
      (acc, m) => ({
        duration: acc.duration + m.duration,
        memoryDelta: acc.memoryDelta + m.memoryDelta,
      }),
      { duration: 0, memoryDelta: 0 }
    );

    return {
      avgDuration: sum.duration / filtered.length,
      avgMemoryDelta: sum.memoryDelta / filtered.length,
      count: filtered.length,
    };
  }

  clearMetrics(): void {
    this.metrics = [];
    this.profiles.clear();
  }

  static async measureAsync<T>(fn: () => Promise<T>, label: string): Promise<{ result: T; metrics: ProfilerMetrics }> {
    const profiler = PerformanceProfiler.getInstance();
    profiler.startProfile(label);
    try {
      const result = await fn();
      const metrics = profiler.endProfile(label);
      if (!metrics) {
        throw new Error(`Failed to capture metrics for ${label}`);
      }
      return { result, metrics };
    } catch (error) {
      profiler.endProfile(label);
      throw error;
    }
  }

  static measureSync<T>(fn: () => T, label: string): { result: T; metrics: ProfilerMetrics } {
    const profiler = PerformanceProfiler.getInstance();
    profiler.startProfile(label);
    try {
      const result = fn();
      const metrics = profiler.endProfile(label);
      if (!metrics) {
        throw new Error(`Failed to capture metrics for ${label}`);
      }
      return { result, metrics };
    } catch (error) {
      profiler.endProfile(label);
      throw error;
    }
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as Performance & { memory: { usedJSHeapSize: number } }).memory;
      return memory.usedJSHeapSize;
    }
    return 0;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  generateReport(): string {
    const report = this.metrics.reduce((acc, m) => {
      if (!acc[m.label]) {
        acc[m.label] = { durations: [], memoryDeltas: [] };
      }
      acc[m.label].durations.push(m.duration);
      acc[m.label].memoryDeltas.push(m.memoryDelta);
      return acc;
    }, {} as Record<string, { durations: number[]; memoryDeltas: number[] }>);

    let output = '\n=== Performance Profiler Report ===\n';
    for (const [label, data] of Object.entries(report)) {
      const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      const avgMemory = data.memoryDeltas.reduce((a, b) => a + b, 0) / data.memoryDeltas.length;
      const minDuration = Math.min(...data.durations);
      const maxDuration = Math.max(...data.durations);
      output += `${label}: count=${data.durations.length}, avg=${avgDuration.toFixed(2)}ms, min=${minDuration.toFixed(2)}ms, max=${maxDuration.toFixed(2)}ms, avgMem=${this.formatBytes(avgMemory)}\n`;
    }
    return output;
  }
}

export const profiler = PerformanceProfiler.getInstance();

export function createProfiledMethod<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  label: string
): T {
  return (async (...args: unknown[]) => {
    return PerformanceProfiler.measureAsync(() => fn(...args), label);
  }) as T;
}

export function createProfiledSyncMethod<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T {
  return ((...args: unknown[]) => {
    return PerformanceProfiler.measureSync(() => fn(...args), label);
  }) as T;
}