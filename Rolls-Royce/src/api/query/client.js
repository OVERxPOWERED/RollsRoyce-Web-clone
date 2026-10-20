import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

const queryKeyFactory = {
  vehicleKeys: {
    all: () => ['vehicles'],
    lists: (filters = {}) => ['vehicles', 'list', filters],
    detail: (id) => ['vehicles', 'detail', id],
    byCategory: (category) => ['vehicles', 'category', category],
    search: (query) => ['vehicles', 'search', query],
  },
  carouselKeys: {
    all: () => ['carousel'],
    byType: (type) => ['carousel', type],
    hero: () => ['carousel', 'hero'],
    featured: () => ['carousel', 'featured'],
  },
  configKeys: {
    all: () => ['configurations'],
    detail: (id) => ['configurations', 'detail', id],
    byVehicle: (vehicleId) => ['configurations', 'vehicle', vehicleId],
    userConfigs: (userId) => ['configurations', 'user', userId],
    saved: (userId) => ['configurations', 'saved', userId],
  },
  userKeys: {
    profile: (userId) => ['user', 'profile', userId],
    preferences: (userId) => ['user', 'preferences', userId],
    history: (userId) => ['user', 'history', userId],
  },
  dealerKeys: {
    all: () => ['dealers'],
    byLocation: (location) => ['dealers', 'location', location],
    detail: (id) => ['dealers', 'detail', id],
  },
};

export { queryClient, queryKeyFactory };