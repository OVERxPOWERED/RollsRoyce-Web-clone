import { VehicleService } from '@/services/VehicleService';
import { 
  vehicleListQuerySchema, 
  vehicleIdParamSchema, 
  createVehicleSchema, 
  updateVehicleSchema 
} from '@/schemas/vehicleSchemas';
import { ApiError } from '@/types/errors';

const vehicleService = new VehicleService();

function createApiResponse(data, meta = {}) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

export async function getVehicles(filters = {}) {
  const validationResult = vehicleListQuerySchema.safeParse(filters);
  
  if (!validationResult.success) {
    throw new ApiError(
      'Invalid query parameters',
      400,
      'VALIDATION_ERROR',
      validationResult.error.flatten().fieldErrors
    );
  }

  try {
    const { vehicles, total, page, limit } = await vehicleService.listVehicles(validationResult.data);
    
    return createApiResponse(vehicles, {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'Failed to retrieve vehicles',
      500,
      'VEHICLE_LIST_ERROR',
      { originalError: error.message }
    );
  }
}

export async function getVehicleById(id) {
  const validationResult = vehicleIdParamSchema.safeParse({ id });
  
  if (!validationResult.success) {
    throw new ApiError(
      'Invalid vehicle ID',
      400,
      'VALIDATION_ERROR',
      validationResult.error.flatten().fieldErrors
    );
  }

  try {
    const vehicle = await vehicleService.getVehicleById(validationResult.data.id);
    
    if (!vehicle) {
      throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    }
    
    return createApiResponse(vehicle);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'Failed to retrieve vehicle',
      500,
      'VEHICLE_GET_ERROR',
      { originalError: error.message }
    );
  }
}

export async function createVehicle(data) {
  const validationResult = createVehicleSchema.safeParse(data);
  
  if (!validationResult.success) {
    throw new ApiError(
      'Invalid vehicle data',
      400,
      'VALIDATION_ERROR',
      validationResult.error.flatten().fieldErrors
    );
  }

  try {
    const vehicle = await vehicleService.createVehicle(validationResult.data);
    return createApiResponse(vehicle, { created: true });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'Failed to create vehicle',
      500,
      'VEHICLE_CREATE_ERROR',
      { originalError: error.message }
    );
  }
}

export async function updateVehicle(id, data) {
  const idValidation = vehicleIdParamSchema.safeParse({ id });
  
  if (!idValidation.success) {
    throw new ApiError(
      'Invalid vehicle ID',
      400,
      'VALIDATION_ERROR',
      idValidation.error.flatten().fieldErrors
    );
  }

  const dataValidation = updateVehicleSchema.safeParse(data);
  
  if (!dataValidation.success) {
    throw new ApiError(
      'Invalid vehicle data',
      400,
      'VALIDATION_ERROR',
      dataValidation.error.flatten().fieldErrors
    );
  }

  try {
    const vehicle = await vehicleService.updateVehicle(idValidation.data.id, dataValidation.data);
    
    if (!vehicle) {
      throw new ApiError('Vehicle not found', 404, 'VEHICLE_NOT_FOUND');
    }
    
    return createApiResponse(vehicle, { updated: true });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'Failed to update vehicle',
      500,
      'VEHICLE_UPDATE_ERROR',
      { originalError: error.message }
    );
  }
}