```typescript
import { http, HttpResponse, delay } from 'msw';
import { z } from 'zod';

// ============================================================================
// Zod Schemas (matching the actual domain models)
// ============================================================================

export const VehicleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  model: z.string().min(1).max(50),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  startingPrice: z.number().positive(),
  currency: z.string().length(3).default('GBP'),
  category: z.enum(['sedan', 'suv', 'coupe', 'convertible', 'electric']),
  powertrain: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'plug-in-hybrid']),
  images: z.array(z.object({
    id: z.string().uuid(),
    url: z.string().url(),
    alt: z.string(),
    type: z.enum(['exterior', 'interior', 'detail', 'lifestyle']),
    order: z.number().int().nonnegative(),
  })).min(1),
  specifications: z.object({
    engine: z.string(),
    power: z.string(),
    torque: z.string(),
    acceleration: z.string(),
    topSpeed: z.string(),
    transmission: z.string(),
    drivetrain: z.string(),
    fuelEconomy: z.string().optional(),
    electricRange: z.string().optional(),
    batteryCapacity: z.string().optional(),
    chargingTime: z.string().optional(),
  }),
  features: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    category: z.enum(['comfort', 'technology', 'safety', 'performance', 'exterior', 'interior']),
    description: z.string(),
    included: z.boolean(),
  })),
  colors: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    type: z.enum(['solid', 'metallic', 'pearlescent', 'bespoke']),
    price: z.number().nonnegative(),
    imageUrl: z.string().url(),
  })).min(1),
  isNew: z.boolean(),
  isFeatured: z.boolean(),
  badge: z.string().optional(),
});

export const CarouselItemSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  title: z.string().min(1).max(100),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(500),
  imageUrl: z.string().url(),
  mobileImageUrl: z.string().url().optional(),
  ctaText: z.string().max(50),
  ctaLink: z.string().url(),
  order: z.number().int().nonnegative(),
  isActive: z.boolean(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const ConfigurationSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  exteriorColorId: z.string().uuid(),
  interiorColorId: z.string().uuid(),
  wheelId: z.string().uuid().optional(),
  trimId: z.string().uuid().optional(),
  options: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    category: z.string(),
    price: z.number().nonnegative(),
    selected: z.boolean(),
  })),
  totalPrice: z.number().positive(),
  currency: z.string().length(3).default('GBP'),
  status: z.enum(['draft', 'saved', 'ordered', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  shareToken: z.string().optional(),
});

export const VehicleQueryParamsSchema = z.object({
  category: z.enum(['sedan', 'suv', 'coupe', 'convertible', 'electric']).optional(),
  powertrain: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'plug-in-hybrid']).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  featured: z.coerce.boolean().optional(),
  new: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'price', 'year', 'newest']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
});

export const CarouselQueryParamsSchema = z.object({
  activeOnly: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().positive().max(20).default(10),
});

export const ConfigurationQueryParamsSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(['draft', 'saved', 'ordered', 'archived']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Vehicle = z.infer<typeof VehicleSchema>;
export type CarouselItem = z.infer<typeof CarouselItemSchema>;
export type Configuration = z.infer<typeof ConfigurationSchema>;
export type VehicleQueryParams = z.infer<typeof VehicleQueryParamsSchema>;
export type CarouselQueryParams = z.infer<typeof CarouselQueryParamsSchema>;
export type ConfigurationQueryParams = z.infer<typeof ConfigurationQueryParamsSchema>;

// ============================================================================
// Validation Utility
// ============================================================================

export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string | string[] | undefined>
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const normalizedParams: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      normalizedParams[key] = value[0] ?? '';
    } else if (value