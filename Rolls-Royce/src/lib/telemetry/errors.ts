import { z } from 'zod';

export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
}

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_FAILED, 400, details);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier: string | number, details?: Record<string, unknown>) {
    super(`${resource} not found: ${identifier}`, ErrorCode.NOT_FOUND, 404, {
      resource,
      identifier,
      ...details,
    });
  }
}

export class ServiceError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.SERVICE_UNAVAILABLE, 503, details);
  }
}

export class TransformationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.TRANSFORMATION_ERROR, 500, details);
  }
}

export function createValidationError(message: string, details?: Record<string, unknown>): ValidationError {
  return new ValidationError(message, details);
}

export function createNotFoundError(
  resource: string,
  identifier: string | number,
  details?: Record<string, unknown>
): NotFoundError {
  return new NotFoundError(resource, identifier, details);
}

export function createServiceError(message: string, details?: Record<string, unknown>): ServiceError {
  return new ServiceError(message, details);
}

export function createTransformationError(message: string, details?: Record<string, unknown>): TransformationError {
  return new TransformationError(message, details);
}

export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface TelemetryContext {
  service: string;
  operation: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  requestId?: string;
}

export interface TelemetryEvent {
  timestamp: string;
  level: TelemetryLevel;
  message: string;
  context: TelemetryContext;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
}

export const TelemetryContextSchema = z.object({
  service: z.string().min(1),
  operation: z.string().min(1),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  userId: z.string().optional(),
  requestId: z.string().optional(),
});

export const TelemetryEventSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
  message: z.string().min(1),
  context: TelemetryContextSchema,
  metadata: z.record(z.unknown()).optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      code: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional(),
});

export type ValidatedTelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export function validateTelemetryEvent(event: unknown): ValidatedTelemetryEvent {
  return TelemetryEventSchema.parse(event);
}

export function createTelemetryEvent(
  level: TelemetryLevel,
  message: string,
  context: TelemetryContext,
  metadata?: Record<string, unknown>,
  error?: Error
): TelemetryEvent {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    metadata,
    error: error
      ? {
          name: error.name,
          message: error.message,
          code: error instanceof DomainError ? error.code : undefined,
          stack: error.stack,
        }
      : undefined,
  };
}