import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient, vehicleKeys } from '@/api/query/client';
import { vehicleEndpoints } from '@/api/endpoints/vehicleEndpoints';
import type { Vehicle, VehicleFilters, CreateVehicleData, UpdateVehicleData } from '@/types/vehicle';

export function useVehicles(filters: VehicleFilters = {}) {
  return useQuery({
    queryKey: vehicleKeys.lists(filters),
    queryFn: () => vehicleEndpoints.getVehicles(filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => vehicleEndpoints.getVehicle(id!),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCreateVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVehicleData) => vehicleEndpoints.createVehicle(data),
    onSuccess: (newVehicle: Vehicle) => {
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
      client.setQueryData(vehicleKeys.detail(newVehicle.id), newVehicle);
    },
  });
}

export function useUpdateVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVehicleData }) =>
      vehicleEndpoints.updateVehicle(id, data),
    onMutate: async ({ id, data }) => {
      await client.cancelQueries({ queryKey: vehicleKeys.detail(id) });

      const previousVehicle = client.getQueryData<Vehicle>(vehicleKeys.detail(id));

      client.setQueryData<Vehicle>(vehicleKeys.detail(id), (old) => ({
        ...old!,
        ...data,
        id,
      }));

      return { previousVehicle };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousVehicle) {
        client.setQueryData(vehicleKeys.detail(id), context.previousVehicle);
      }
    },
    onSuccess: (updatedVehicle: Vehicle) => {
      client.setQueryData(vehicleKeys.detail(updatedVehicle.id), updatedVehicle);
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
    },
    onSettled: (_data, _error, { id }) => {
      client.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
    },
  });
}

export function useDeleteVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => vehicleEndpoints.deleteVehicle(id),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: vehicleKeys.detail(id) });
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
    },
  });
}