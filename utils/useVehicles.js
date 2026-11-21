```javascript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import vehicleService from '../services/vehicleService';
import { useToast } from './useToast';

export const VEHICLE_QUERY_KEYS = {
  all: ['vehicles'] as const,
  lists: () => [...VEHICLE_QUERY_KEYS.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...VEHICLE_QUERY_KEYS.lists(), filters] as const,
  details: () => [...VEHICLE_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...VEHICLE_QUERY_KEYS.details(), id] as const,
  featured: () => [...VEHICLE_QUERY_KEYS.all, 'featured'] as const,
};

export interface Vehicle {
  id: string;
  model: string;
  series: string;
  year: number;
  price: number;
  currency: string;
  images: string[];
  specifications: {
    engine: string;
    power: string;
    torque: string;
    transmission: string;
    drivetrain: string;
    acceleration: string;
    topSpeed: string;
    fuelEconomy: string;
  };
  features: string[];
  colors: Array<{ name: string; hex: string; image: string }>;
  isFeatured: boolean;
  availability: 'available' | 'reserved' | 'sold' | 'coming-soon';
  description: string;
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UseVehiclesOptions {
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UseVehiclesReturn {
  vehicles: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface UseVehicleReturn {
  vehicle: Vehicle | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseFeaturedVehiclesReturn {
  vehicles: Vehicle[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function handleQueryError(error: unknown, toast: ReturnType<typeof useToast>['toast']) {
  if (error instanceof Error) {
    if (error.name === 'ValidationError' || error.message.includes('validation')) {
      toast({
        type: 'error',
        title: 'Validation Error',
        message: error.message,
      });
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      toast({
        type: 'error',
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
      });
    } else {
      toast({
        type: 'error',
        title: 'Error',
        message: error.message,
      });
    }
  }
}

export function useVehicles(options: UseVehiclesOptions = {}): UseVehiclesReturn {
  const { page = 1, pageSize = 12, filters = {}, enabled = true } = options;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: VEHICLE_QUERY_KEYS.list({ page, pageSize, ...filters }),
    queryFn: () => vehicleService.getVehicles({ page, pageSize, ...filters }),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === 'ValidationError') {
        return false;
      }
      return failureCount < 3;
    },
    onError: (error) => handleQueryError(error, toast),
  });

  const fetchNextPage = useCallback(async () => {
    if (query.data && page < query.data.totalPages) {
      await queryClient.prefetchQuery({
        queryKey: VEHICLE_QUERY_KEYS.list({ page: page + 1, pageSize, ...filters }),
        queryFn: () => vehicleService.getVehicles({ page: page + 1, pageSize, ...filters }),
      });
    }
  }, [queryClient, query.data, page, pageSize, filters]);

  const fetchPreviousPage = useCallback(async () => {
    if (page > 1) {
      await queryClient.prefetchQuery({
        queryKey: VEHICLE_QUERY_KEYS.list({ page: page - 1, pageSize, ...filters }),
        queryFn: () => vehicleService.getVehicles({ page: page - 1, pageSize, ...filters }),
      });
    }
  }, [queryClient, page, pageSize, filters]);

  return {
    vehicles: query.data?.vehicles ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    pageSize: query.data?.pageSize ?? pageSize,
    totalPages: query.data?.totalPages ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage: page < (query.data?.totalPages ?? 0),
    hasPreviousPage: page > 1,
  };
}

export function useVehicle(id: string | undefined): UseVehicleReturn {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: VEHICLE_QUERY_KEYS.detail(id ?? ''),
    queryFn: () => vehicleService.getVehicleById(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof Error && (error.name === 'ValidationError' || error.message.includes('404'))) {
        return false;
      }
      return failureCount < 3;
    },
    onError: (error) => handleQueryError(error, toast),
  });

  return {
    vehicle: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useFeaturedVehicles(limit: number = 5): UseFeaturedVehiclesReturn {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: VEHICLE_QUERY_KEYS.featured(),
    queryFn: () => vehicleService.getFeaturedVehicles(limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === 'ValidationError') {