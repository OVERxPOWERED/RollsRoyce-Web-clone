import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import vehicleService from '@/utils/vehicleService';

const REGRESSION_THRESHOLDS = {
  GET_VEHICLES_P95_MS: 120,
  CACHE_INVALIDATION_P95_MS: 50,
  CACHE_HIT_RATE_PERCENT: 80,
  TEST_TIMEOUT_MS: 30000,
  ITERATIONS: 100,
  WARMUP_ITERATIONS: 10,
};

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil(percentile / 100 * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

function calculateStats(timings: number[]) {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p50: calculatePercentile(sorted, 50),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  };
}

describe('VehicleService Performance Benchmarks', () => {
  let originalCache: Map<string, unknown> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vehicleService.clearCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vehicleService.clearCache();
  });

  describe('getVehicles() - Warm Cache Performance', () => {
    it('should meet p95 < 120ms threshold with warm cache', async () => {
      const timings: number[] = [];

      await vehicleService.getVehicles();

      for (let i = 0; i < REGRESSION_THRESHOLDS.WARMUP_ITERATIONS; i++) {
        await vehicleService.getVehicles();
      }

      for (let i = 0; i < REGRESSION_THRESHOLDS.ITERATIONS; i++) {
        const start = performance.now();
        await vehicleService.getVehicles();
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = calculateStats(timings);

      console.log('getVehicles() Warm Cache Stats:', stats);

      expect(stats.p95).toBeLessThan(REGRESSION_THRESHOLDS.GET_VEHICLES_P95_MS);
      expect(stats.mean).toBeLessThan(REGRESSION_THRESHOLDS.GET_VEHICLES_P95_MS * 0.7);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });

  describe('Cache Invalidation Performance', () => {
    it('should invalidate cache in < 50ms p95', async () => {
      const timings: number[] = [];

      await vehicleService.getVehicles();

      for (let i = 0; i < REGRESSION_THRESHOLDS.WARMUP_ITERATIONS; i++) {
        vehicleService.invalidateCache();
        await vehicleService.getVehicles();
      }

      for (let i = 0; i < REGRESSION_THRESHOLDS.ITERATIONS; i++) {
        const start = performance.now();
        vehicleService.invalidateCache();
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = calculateStats(timings);

      console.log('Cache Invalidation Stats:', stats);

      expect(stats.p95).toBeLessThan(REGRESSION_THRESHOLDS.CACHE_INVALIDATION_P95_MS);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });

  describe('Cache Hit Rate Under Load', () => {
    it('should maintain > 80% cache hit rate under concurrent load', async () => {
      const hitRateTimings: number[] = [];
      const concurrency = 10;
      const requestsPerBatch = 10;

      await vehicleService.getVehicles();

      for (let batch = 0; batch < REGRESSION_THRESHOLDS.ITERATIONS / requestsPerBatch; batch++) {
        const promises: Promise<unknown>[] = [];
        let cacheHits = 0;
        let totalRequests = 0;

        for (let i = 0; i < concurrency; i++) {
          promises.push(
            (async () => {
              for (let j = 0; j < requestsPerBatch; j++) {
                const start = performance.now();
                await vehicleService.getVehicles();
                const end = performance.now();
                totalRequests++;
                if (end - start < 5) {
                  cacheHits++;
                }
              }
            })()
          );
        }

        await Promise.all(promises);
        const hitRate = (cacheHits / totalRequests) * 100;
        hitRateTimings.push(hitRate);
      }

      const avgHitRate = hitRateTimings.reduce((a, b) => a + b, 0) / hitRateTimings.length;
      const minHitRate = Math.min(...hitRateTimings);

      console.log('Cache Hit Rate Stats:', { avgHitRate, minHitRate, allRates: hitRateTimings });

      expect(avgHitRate).toBeGreaterThan(REGRESSION_THRESHOLDS.CACHE_HIT_RATE_PERCENT);
      expect(minHitRate).toBeGreaterThan(REGRESSION_THRESHOLDS.CACHE_HIT_RATE_PERCENT * 0.9);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });

  describe('getVehicleById() - Cache Behavior', () => {
    it('should serve cached vehicle lookups in < 5ms p95', async () => {
      const timings: number[] = [];
      const testVehicleId = 'RR-2024-PHANTOM-001';

      await vehicleService.getVehicleById(testVehicleId);

      for (let i = 0; i < REGRESSION_THRESHOLDS.WARMUP_ITERATIONS; i++) {
        await vehicleService.getVehicleById(testVehicleId);
      }

      for (let i = 0; i < REGRESSION_THRESHOLDS.ITERATIONS; i++) {
        const start = performance.now();
        await vehicleService.getVehicleById(testVehicleId);
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = calculateStats(timings);

      console.log('getVehicleById() Warm Cache Stats:', stats);

      expect(stats.p95).toBeLessThan(5);
      expect(stats.mean).toBeLessThan(3);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });

  describe('searchVehicles() - Query Performance', () => {
    it('should execute filtered searches in < 100ms p95', async () => {
      const timings: number[] = [];
      const filters = { model: 'Ghost', year: 2024, status: 'available' };

      await vehicleService.searchVehicles(filters);

      for (let i = 0; i < REGRESSION_THRESHOLDS.WARMUP_ITERATIONS; i++) {
        await vehicleService.searchVehicles(filters);
      }

      for (let i = 0; i < REGRESSION_THRESHOLDS.ITERATIONS; i++) {
        const start = performance.now();
        await vehicleService.searchVehicles(filters);
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = calculateStats(timings);

      console.log('searchVehicles() Warm Cache Stats:', stats);

      expect(stats.p95).toBeLessThan(100);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });

  describe('Memory Pressure & Cache Eviction', () => {
    it('should handle cache eviction without performance degradation', async () => {
      const timings: number[] = [];
      const vehicleIds = Array.from({ length: 200 }, (_, i) => `RR-2024-MODEL-${String(i).padStart(3, '0')}`);

      for (const id of vehicleIds) {
        await vehicleService.getVehicleById(id);
      }

      for (let i = 0; i < REGRESSION_THRESHOLDS.ITERATIONS; i++) {
        const randomId = vehicleIds[Math.floor(Math.random() * vehicleIds.length)];
        const start = performance.now();
        await vehicleService.getVehicleById(randomId);
        const end = performance.now();
        timings.push(end - start);
      }

      const stats = calculateStats(timings);

      console.log('Cache Under Memory Pressure Stats:', stats);

      expect(stats.p95).toBeLessThan(REGRESSION_THRESHOLDS.GET_VEHICLES_P95_MS);
    }, REGRESSION_THRESHOLDS.TEST_TIMEOUT_MS);
  });
});