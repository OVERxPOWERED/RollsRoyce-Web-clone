```typescript
import { http, HttpResponse } from 'msw';
import { useState, useEffect, useCallback } from 'react';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  service: string;
  status: HealthStatus;
  latencyMs: number;
  timestamp: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface SystemHealthReport {
  overall: HealthStatus;
  checks: HealthCheckResult[];
  timestamp: string;
  version: string;
}

interface CheckConfig {
  timeoutMs: number;
  degradedThresholdMs: number;
  unhealthyThresholdMs: number;
}

const DEFAULT_CONFIG: CheckConfig = {
  timeoutMs: 5000,
  degradedThresholdMs: 1000,
  unhealthyThresholdMs: 3000,
};

class HealthCheckService {
  private config: CheckConfig;
  private cache: Map<string, { data: unknown; timestamp: number; ttl: number }> = new Map();

  constructor(config: Partial<CheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async measureLatency<T>(
    serviceName: string,
    checkFn: () => Promise<T>,
    detailsExtractor?: (result: T) => Record<string, unknown>
  ): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    try:
      const result = await Promise.race([
        checkFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.config.timeoutMs)
        ),
      ]);

      const latencyMs = Math.round(performance.now() - startTime);
      let status: HealthStatus = 'healthy';

      if (latencyMs >= this.config.unhealthyThresholdMs) {
        status = 'unhealthy';
      } else if (latencyMs >= this.config.degradedThresholdMs) {
        status = 'degraded';
      }

      return {
        service: serviceName,
        status,
        latencyMs,
        timestamp,
        details: detailsExtractor ? detailsExtractor(result) : undefined,
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        service: serviceName,
        status: 'unhealthy',
        latencyMs,
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkApiConnectivity(): Promise<HealthCheckResult> {
    return this.measureLatency('api-connectivity', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch('/api/health/ping', {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API returned ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return { reachable: true, response: data };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('API connectivity check timed out');
        }
        throw error;
      }
    }, (result) => ({ reachable: result.reachable, responseKeys: Object.keys(result.response || {}) }));
  }

  async checkCacheStatus(): Promise<HealthCheckResult> {
    return this.measureLatency('cache-status', async () => {
      const testKey = `__health_check_${Date.now()}`;
      const testValue = { test: true, timestamp: Date.now() };

      this.cache.set(testKey, { data: testValue, timestamp: Date.now(), ttl: 60000 });

      const retrieved = this.cache.get(testKey);
      const writeReadLatency = performance.now();

      this.cache.delete(testKey);

      const expiredCount = Array.from(this.cache.values()).filter(
        (entry) => Date.now() - entry.timestamp > entry.ttl
      ).length;

      const totalEntries = this.cache.size;
      const hitRate = totalEntries > 0 ? 1 - expiredCount / totalEntries : 1;

      return {
        writeReadLatencyMs: Math.round(writeReadLatency),
        totalEntries,
        expiredEntries: expiredCount,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    }, (result) => ({
      writeReadLatencyMs: result.writeReadLatencyMs,
      totalEntries: result.totalEntries,
      expiredEntries: result.expiredEntries,
      hitRate: result.hitRate,
    }));
  }

  async checkDataIntegrity(): Promise<HealthCheckResult> {
    return this.measureLatency('data-integrity', async () => {
      const testRecords = [
        { id: 'health-1', value: 'test-data-1', checksum: 'abc123' },
        { id: 'health-2', value: 'test-data-2', checksum: 'def456' },
        { id: 'health-3', value: 'test-data-3', checksum: 'ghi789' },
      ];

      let corruptedCount = 0;
      let totalChecked = 0;

      for (const record of testRecords) {
        totalChecked++;
        const computedChecksum = this.computeChecksum(record.value);
        if (computedChecksum !== record.checksum) {
          corruptedCount++;
        }
      }

      const integrityScore = totalChecked > 0 ? 1 - corruptedCount / totalChecked : 1;

      if (corruptedCount > 0) {
        throw new Error(`Data integrity check failed: ${corruptedCount}/${totalChecked} records corrupted`);
      }

      return {
        recordsChecked: totalChecked,
        corruptedRecords: corruptedCount,
        integrityScore: Math.round(integrityScore * 100) / 100,
      };
    }, (result) => ({
      recordsChecked: result.recordsChecked,
      corruptedRecords: result.corruptedRecords,
      integrityScore: result.integrityScore,
    }));
  }

  private computeChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(6, '0');
  }

  async runAllChecks(): Promise<SystemHealthReport> {
    const [apiCheck, cacheCheck, integrityCheck] = await Promise.all([
      this.checkApiConnectivity(),
      this.checkCacheStatus(),
      this.checkDataIntegrity(),
    ]);

    const checks = [apiCheck, cacheCheck, integrityCheck];
    const unhealthyCount = checks.filter((c) => c