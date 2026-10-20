import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient, vehicleKeys } from '@/api/query/client';
import { vehicleEndpoints } from '@/api/endpoints/vehicleEndpoints';

export function useVehicles(filters = {}) {
  return useQuery({
    queryKey: vehicleKeys.lists(filters),
    queryFn: () => vehicleEndpoints.getVehicles(filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useVehicle(id) {
  return useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => vehicleEndpoints.getVehicle(id),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCreateVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (data) => vehicleEndpoints.createVehicle(data),
    onSuccess: (newVehicle) => {
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
      client.setQueryData(vehicleKeys.detail(newVehicle.id), newVehicle);
    },
  });
}

export function useUpdateVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => vehicleEndpoints.updateVehicle(id, data),
    onMutate: async ({ id, data }) => {
      await client.cancelQueries({ queryKey: vehicleKeys.detail(id) });

      const previousVehicle = client.getQueryData(vehicleKeys.detail(id));

      client.setQueryData(vehicleKeys.detail(id), (old) => ({
        ...old,
        ...data,
        id,
      }));

      return { previousVehicle };
    },
    onError: (err, { id }, context) => {
      if (context?.previousVehicle) {
        client.setQueryData(vehicleKeys.detail(id), context.previousVehicle);
      }
    },
    onSuccess: (updatedVehicle) => {
      client.setQueryData(vehicleKeys.detail(updatedVehicle.id), updatedVehicle);
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
    },
    onSettled: (data, error, { id }) => {
      client.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
    },
  });
}

export function useDeleteVehicle() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id) => vehicleEndpoints.deleteVehicle(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: vehicleKeys.detail(id) });
      client.invalidateQueries({ queryKey: vehicleKeys.all() });
    },
  });
}