import { validateVehicle, VehicleSchema } from '../domain/models.js';
import { performanceProfiler } from '@/utils/performanceProfiler';

const SLOW_QUERY_THRESHOLD_MS = 100;

class VehicleService {
  static cacheHit = 0;
  static cacheMiss = 0;
  static queryTimes = [];
  static slowQueryCount = 0;

  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.vehicles = this.loadVehicleData();
  }

  loadVehicleData() {
    return [
      {
        id: 'rr-phantom-2024',
        name: 'Phantom',
        category: 'sedan',
        year: 2024,
        price: 450000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '900 Nm',
        acceleration: '5.4s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'RWD',
        dimensions: {
          length: 5762,
          width: 2018,
          height: 1646,
          wheelbase: 3552
        },
        weight: 2560,
        fuelConsumption: '14.2 L/100km',
        co2Emissions: '322 g/km',
        features: [
          'Starlight Headliner',
          'The Gallery',
          'Power Reserve Gauge',
          'Self-Righting Wheel Centers',
          'Bespoke Audio System',
          'Rear Theatre Configuration'
        ],
        images: [
          '/images/phantom-exterior.jpg',
          '/images/phantom-interior.jpg',
          '/images/phantom-detail.jpg'
        ],
        featured: true,
        description: 'The Phantom is the pinnacle of Rolls-Royce motor cars, representing the absolute zenith of luxury, craftsmanship, and engineering excellence.'
      },
      {
        id: 'rr-ghost-2024',
        name: 'Ghost',
        category: 'sedan',
        year: 2024,
        price: 315000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '850 Nm',
        acceleration: '4.8s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'AWD',
        dimensions: {
          length: 5546,
          width: 1979,
          height: 1571,
          wheelbase: 3295
        },
        weight: 2490,
        fuelConsumption: '13.8 L/100km',
        co2Emissions: '313 g/km',
        features: [
          'Planar Suspension System',
          'Whisper Quiet Interior',
          'Illuminated Fascia',
          'Bespoke Clock',
          'Rear Privacy Suite'
        ],
        images: [
          '/images/ghost-exterior.jpg',
          '/images/ghost-interior.jpg'
        ],
        featured: true,
        description: 'The Ghost represents the most technologically advanced Rolls-Royce ever created, combining effortless power with contemporary design.'
      },
      {
        id: 'rr-cullinan-2024',
        name: 'Cullinan',
        category: 'suv',
        year: 2024,
        price: 330000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '850 Nm',
        acceleration: '5.2s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'AWD',
        dimensions: {
          length: 5341,
          width: 2000,
          height: 1835,
          wheelbase: 3295
        },
        weight: 2660,
        fuelConsumption: '15.0 L/100km',
        co2Emissions: '341 g/km',
        features: [
          'All-Terrain Capability',
          'Viewing Suite',
          'Recreation Module',
          'Partition Glass',
          'Bespoke Rear Seating'
        ],
        images: [
          '/images/cullinan-exterior.jpg',
          '/images/cullinan-interior.jpg',
          '/images/cullinan-rear.jpg'
        ],
        featured: true,
        description: 'The Cullinan is the first all-terrain SUV from Rolls-Royce, making luxury effortless, everywhere.'
      },
      {
        id: 'rr-spectre-2024',
        name: 'Spectre',
        category: 'coupe',
        year: 2024,
        price: 320000,
        currency: 'GBP',
        engine: 'Dual Electric Motors',
        power: '577 hp',
        torque: '900 Nm',
        acceleration: '4.5s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: 'Single-speed',
        drivetrain: 'AWD',
        dimensions: {
          length: 5453,
          width: 2017,
          height: 1573,
          wheelbase: 3210
        },
        weight: 2975,
        fuelConsumption: '0 L/100km',
        co2Emissions: '0 g/km',
        features: [
          'Electric Architecture',
          'Starlight Doors',
          'Illuminated Grille',
          'Bespoke Spectre Clock',
          'Whisper Quiet Ride'
        ],
        images: [
          '/images/spectre-exterior.jpg',
          '/images/spectre-interior.jpg'
        ],
        featured: true,
        description: 'The Spectre is the first fully electric Rolls-Royce, defining a new era of silent, powerful luxury.'
      }
    ];
  }

  getVehicles(filters = {}) {
    const timerId = performanceProfiler.startTimer('vehicleService.getVehicles');
    
    try {
      const cacheKey = JSON.stringify(filters);
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        VehicleService.cacheHit++;
        return cached.data;
      }
      
      VehicleService.cacheMiss++;
      
      let result = [...this.vehicles];
      
      if (filters.category) {
        result = result.filter(v => v.category === filters.category);
      }
      if (filters.featured !== undefined) {
        result = result.filter(v => v.featured === filters.featured);
      }
      if (filters.minPrice !== undefined) {
        result = result.filter(v => v.price >= filters.minPrice);
      }
      if (filters.maxPrice !== undefined) {
        result = result.filter(v => v.price <= filters.maxPrice);
      }
      if (filters.year) {
        result = result.filter(v => v.year === filters.year);
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        result = result.filter(v => 
          v.name.toLowerCase().includes(searchLower) ||
          v.description.toLowerCase().includes(searchLower)
        );
      }
      
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } finally {
      const duration = performanceProfiler.endTimer(timerId);
      VehicleService.queryTimes.push(duration);
      
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        VehicleService.slowQueryCount++;
        console.warn(`[VehicleService] Slow query detected: ${duration.toFixed(2)}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
      }
      
      // Keep only last 1000 query times for percentile calculation
      if (VehicleService.queryTimes.length > 1000) {
        VehicleService.queryTimes.shift();
      }
    }
  }

  getVehicleById(id) {
    const timerId = performanceProfiler.startTimer('vehicleService.getVehicleById');
    
    try {
      const cacheKey = `id:${id}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        VehicleService.cacheHit++;
        return cached.data;
      }
      
      VehicleService.cacheMiss++;
      
      const vehicle = this.vehicles.find(v => v.id === id);
      
      if (vehicle) {
        this.cache.set(cacheKey, {
          data: vehicle,
          timestamp: Date.now()
        });
      }
      
      return vehicle;
    } finally {
      const duration = performanceProfiler.endTimer(timerId);
      VehicleService.queryTimes.push(duration);
      
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        VehicleService.slowQueryCount++;
        console.warn(`[VehicleService] Slow query detected: ${duration.toFixed(2)}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
      }
      
      if (VehicleService.queryTimes.length > 1000) {
        VehicleService.queryTimes.shift();
      }
    }
  }

  invalidateCache() {
    const timerId = performanceProfiler.startTimer('vehicleService.invalidateCache');
    
    try {
      const cacheSize = this.cache.size;
      this.cache.clear();
      console.log(`[VehicleService] Cache invalidated, cleared ${cacheSize} entries`);
    } finally {
      const duration = performanceProfiler.endTimer(timerId);
      console.log(`[VehicleService] Cache invalidation took ${duration.toFixed(2)}ms`);
    }
  }

  static getPerformanceMetrics() {
    const { cacheHit, cacheMiss, queryTimes, slowQueryCount } = VehicleService;
    const totalRequests = cacheHit + cacheMiss;
    const cacheHitRate = totalRequests > 0 ? (cacheHit / totalRequests) * 100 : 0;
    
    let avgQueryTime = 0;
    let p95QueryTime = 0;
    
    if (queryTimes.length > 0) {
      const sortedTimes = [...queryTimes].sort((a, b) => a - b);
      const sum = sortedTimes.reduce((acc, time) => acc + time, 0);
      avgQueryTime = sum / sortedTimes.length;
      
      const p95Index = Math.ceil(sortedTimes.length * 0.95) - 1;
      p95QueryTime = sortedTimes[Math.max(0, p95Index)];
    }
    
    return {
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgQueryTime: Math.round(avgQueryTime * 100) / 100,
      p95QueryTime: Math.round(p95QueryTime * 100) / 100,
      slowQueryCount,
      totalQueries: queryTimes.length,
      cacheHits: cacheHit,
      cacheMisses: cacheMiss
    };
  }

  static resetPerformanceMetrics() {
    VehicleService.cacheHit = 0;
    VehicleService.cacheMiss = 0;
    VehicleService.queryTimes = [];
    VehicleService.slowQueryCount = 0;
  }
}

export default VehicleService;