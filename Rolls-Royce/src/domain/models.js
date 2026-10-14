import { z } from 'zod';

export const VehicleSchema = z.object({
  id: z.string().uuid({ message: 'Vehicle ID must be a valid UUID' }),
  model: z.string().min(1, { message: 'Model name is required' }).max(100),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  specifications: z.object({
    engine: z.string().min(1),
    horsepower: z.number().int().positive(),
    torque: z.number().int().positive(),
    transmission: z.string().min(1),
    drivetrain: z.string().min(1),
    acceleration: z.number().positive(),
    topSpeed: z.number().positive(),
    fuelEconomy: z.object({
      city: z.number().positive(),
      highway: z.number().positive(),
      combined: z.number().positive(),
    }),
    dimensions: z.object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
      wheelbase: z.number().positive(),
      curbWeight: z.number().positive(),
    }),
  }),
  price: z.object({
    base: z.number().positive(),
    currency: z.string().length(3).default('USD'),
    formatted: z.string().optional(),
  }),
  images: z.array(z.string().url()).min(1).optional(),
  features: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CarouselItemSchema = z.object({
  id: z.string().uuid({ message: 'Carousel item ID must be a valid UUID' }),
  imageUrl: z.string().url({ message: 'Image URL must be a valid URL' }),
  altText: z.string().min(1, { message: 'Alt text is required' }).max(200),
  caption: z.string().max(500).optional(),
  ctaLink: z.string().url({ message: 'CTA link must be a valid URL' }).optional(),
  ctaText: z.string().max(50).optional(),
  order: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

export const ConfigurationSchema = z.object({
  exteriorColor: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    hexCode: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    price: z.number().nonnegative().default(0),
    isStandard: z.boolean().default(false),
  }),
  interiorTrim: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    material: z.string().min(1),
    color: z.string().min(1),
    price: z.number().nonnegative().default(0),
    isStandard: z.boolean().default(false),
  }),
  wheelDesign: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.string().min(1),
    finish: z.string().min(1),
    price: z.number().nonnegative().default(0),
    isStandard: z.boolean().default(false),
  }),
  options: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().min(1),
      price: z.number().nonnegative().default(0),
      isSelected: z.boolean().default(false),
      dependencies: z.array(z.string()).optional(),
      conflicts: z.array(z.string()).optional(),
    })
  ).default([]),
  totalPrice: z.number().nonnegative().default(0),
  currency: z.string().length(3).default('USD'),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
export type CarouselItem = z.infer<typeof CarouselItemSchema>;
export type Configuration = z.infer<typeof ConfigurationSchema>;

export type VehicleInput = z.input<typeof VehicleSchema>;
export type CarouselItemInput = z.input<typeof CarouselItemSchema>;
export type ConfigurationInput = z.input<typeof ConfigurationSchema>;

export interface ValidationResult<T> {
  success: boolean;
  data: T | null;
  errors: z.ZodError | null;
}

export function validateVehicle(input: unknown): ValidationResult<Vehicle> {
  const result = VehicleSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  return { success: false, data: null, errors: result.error };
}

export function validateCarouselItem(input: unknown): ValidationResult<CarouselItem> {
  const result = CarouselItemSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  return { success: false, data: null, errors: result.error };
}

export function validateConfiguration(input: unknown): ValidationResult<Configuration> {
  const result = ConfigurationSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  return { success: false, data: null, errors: result.error };
}

export function validateVehicleArray(input: unknown): ValidationResult<Vehicle[]> {
  const arraySchema = z.array(VehicleSchema);
  const result = arraySchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  return { success: false, data: null, errors: result.error };
}

export function validateCarouselItemArray(input: unknown): ValidationResult<CarouselItem[]> {
  const arraySchema = z.array(CarouselItemSchema);
  const result = arraySchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  return { success: false, data: null, errors: result.error };
}

export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  return formatted;
}

export const VehicleCreateSchema = VehicleSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type VehicleCreate = z.infer<typeof VehicleCreateSchema>;

export const VehicleUpdateSchema = VehicleSchema.partial().omit({ id: true, createdAt: true });
export type VehicleUpdate = z.infer<typeof VehicleUpdateSchema>;

export const ConfigurationPartialSchema = ConfigurationSchema.partial();
export type ConfigurationPartial = z.infer<typeof ConfigurationPartialSchema>;