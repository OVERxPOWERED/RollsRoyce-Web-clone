```javascript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VehicleService } from '../vehicleService.js';

const createMockVehicle = (overrides = {}) => ({
  id: 'RR-2024-PHANTOM-001',
  model: 'Phantom',
  category: 'sedan',
  year: 2024,
  price: 45000000, // in pence (£450,000)
  currency: 'GBP',
  specifications: {
    engine: '6.75L V12',
    power: '563 hp',
    torque: '900 Nm',
    transmission: '8-speed automatic',
    drivetrain: 'AWD',
  },
  features: [
    'Starlight Headliner',
    'Bespoke Audio',
    'Rear Theatre Configuration',
    'Gallery Dashboard',
  ],
  images: [
    'https://cdn.rolls-royce.com/phantom/exterior-1.jpg',
    'https://cdn.rolls-royce.com/phantom/interior-1.jpg',
  ],
  availability: 'available',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

const createMockVehicleList = (count = 5) =>
  Array.from({ length: count }, (_, i) =>
    createMockVehicle({
      id: `RR-2024-PHANTOM-${String(i + 1).padStart(3, '0')}`,
      model: i % 2 === 0 ? 'Phantom' : 'Ghost',
      category: i % 3 === 0 ? 'sedan' : i % 3 === 1 ? 'suv' : 'coupe',
      price: 35000000 + i * 5000000,
      year: 2024 - (i % 3),
    })
  );

describe('VehicleService', () => {
  let service;
  let mockRepository;
  let mockCache;

  beforeEach(() => {
    mockRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByCategory: vi.fn(),
      search: vi.fn(),
    };

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
    };

    service = new VehicleService({
      repository: mockRepository,
      cache: mockCache,
      cacheTtl: 300000, // 5 minutes
    });

    service.clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateVehicleData', () => {
    it('validates correct vehicle data', () => {
      const validVehicle = createMockVehicle();
      const result = service.validateVehicleData(validVehicle);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing required fields', () => {
      const invalidVehicle = { model: 'Phantom' };
      const result = service.validateVehicleData(invalidVehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'id', message: expect.stringContaining('required') })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'category', message: expect.stringContaining('required') })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'price', message: expect.stringContaining('required') })
      );
    });

    it('rejects invalid ID format', () => {
      const vehicle = createMockVehicle({ id: 'invalid-id' });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'id',
          message: expect.stringContaining('format'),
        })
      );
    });

    it('rejects negative price', () => {
      const vehicle = createMockVehicle({ price: -1000 });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'price',
          message: expect.stringContaining('positive'),
        })
      );
    });

    it('rejects invalid category', () => {
      const vehicle = createMockVehicle({ category: 'invalid-category' });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'category',
          message: expect.stringContaining('valid category'),
        })
      );
    });

    it('rejects future year beyond next year', () => {
      const futureYear = new Date().getFullYear() + 2;
      const vehicle = createMockVehicle({ year: futureYear });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'year',
          message: expect.stringContaining('future'),
        })
      );
    });

    it('rejects year before 1904 (Rolls-Royce founding)', () => {
      const vehicle = createMockVehicle({ year: 1900 });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'year',
          message: expect.stringContaining('1904'),
        })
      );
    });

    it('validates specifications structure', () => {
      const vehicle = createMockVehicle({
        specifications: 'not-an-object',
      });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'specifications',
          message: expect.stringContaining('object'),
        })
      );
    });

    it('validates features array', () => {
      const vehicle = createMockVehicle({ features: 'not-an-array' });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'features',
          message: expect.stringContaining('array'),
        })
      );
    });

    it('validates images array with valid URLs', () => {
      const vehicle = createMockVehicle({ images: ['not-a-url'] });
      const result = service.validateVehicleData(vehicle);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'images',
          message: expect.stringContaining('valid URL'),
        })
      );
    });
  });

  describe('getVehicle', () => {
    it('returns vehicle from repository when not cached', async () => {
      const mockVehicle = createMockVehicle();
      mockRepository.findById.mockResolvedValue(mockVehicle);
      mockCache.get.mockResolvedValue(null);

      const result = await