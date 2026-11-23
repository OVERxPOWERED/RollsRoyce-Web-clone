import { useCallback, useRef, useEffect, useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { openDB } from 'idb';
import { z } from 'zod';
import { vehicleConfigSchema } from '../api/vehicleEndpoints';
import { useFeatureFlag } from './useFeatureFlags';
import { useTelemetry } from './useTelemetry';
import { vehicleApi } from '../api/vehicleEndpoints';

// Types
export const SyncStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  ERROR: 'error',
  SYNCED: 'synced',
};

export const ConflictResolutionStrategy = {
  SERVER_WINS: 'server-wins',
  CLIENT_WINS: 'client-wins',
  MERGE: 'merge',
};

export const VehicleConfigurationSchema = vehicleConfigSchema.extend({
  vehicleId: z.string().uuid(),
  version: z.number().int().positive(),
  vectorClock: z.record(z.string(), z.number().int().nonnegative()),
  lastModified: z.string().datetime(),
  lastModifiedBy: z.string().uuid(),
  checksum: z.string().optional(),
});

export const VehicleConfiguration = VehicleConfigurationSchema;

export const SyncStatusType = z.nativeEnum(SyncStatus);
export const ConflictResolutionStrategyType = z.nativeEnum(ConflictResolutionStrategy);

const DB_NAME = 'vehicle-config-db';
const DB_VERSION = 2;
const STORE_CONFIGURATIONS = 'configurations';
const STORE_SYNC_QUEUE = 'syncQueue';
const STORE_VECTOR_CLOCKS = 'vectorClocks';

let dbPromise = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE_CONFIGURATIONS)) {
          const configStore = db.createObjectStore(STORE_CONFIGURATIONS, { keyPath: 'vehicleId' });
          configStore.createIndex('by-version', 'version');
          configStore.createIndex('by-last-modified', 'lastModified');
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('by-vehicle-id', 'vehicleId');
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains(STORE_VECTOR_CLOCKS)) {
          db.createObjectStore(STORE_VECTOR_CLOCKS, { keyPath: 'vehicleId' });
        }
        if (oldVersion < 2) {
          const configStore = db.transaction.objectStore(STORE_CONFIGURATIONS);
          configStore.createIndex('by-checksum', 'checksum');
        }
      },
    });
  }
  return dbPromise;
};

const generateVectorClock = (deviceId, existingClock = {}) => {
  const clock = { ...existingClock };
  clock[deviceId] = (clock[deviceId] || 0) + 1;
  return clock;
};

const compareVectorClocks = (clockA, clockB) => {
  const allKeys = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);
  let aGreater = false;
  let bGreater = false;

  for (const key of allKeys) {
    const a = clockA[key] || 0;
    const b = clockB[key] || 0;
    if (a > b) aGreater = true;
    if (b > a) bGreater = true;
  }

  if (aGreater && !bGreater) return 'A_GREATER';
  if (bGreater && !aGreater) return 'B_GREATER';
  if (aGreater && bGreater) return 'CONCURRENT';
  return 'EQUAL';
};

const mergeVectorClocks = (clockA, clockB) => {
  const merged = { ...clockA };
  for (const [key, value] of Object.entries(clockB)) {
    merged[key] = Math.max(merged[key] || 0, value);
  }
  return merged;
};

const computeChecksum = (config) => {
  const str = JSON.stringify(config, Object.keys(config).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

const getDeviceId = () => {
  let deviceId = localStorage.getItem('vehicle-config-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('vehicle-config-device-id', deviceId);
  }
  return deviceId;
};

export const useVehicleConfiguration = (vehicleId) => {
  const queryClient = useQueryClient();
  const deviceId = useRef(getDeviceId());
  const [syncStatus, setSyncStatus] = useState(SyncStatus.IDLE);
  const [pendingConflicts, setPendingConflicts] = useState([]);
  const isAdvancedEditorEnabled = useFeatureFlag('advanced-config-editor');
  const { trackEvent } = useTelemetry();

  const configurationQuery = useQuery({
    queryKey: ['vehicleConfiguration', vehicleId],
    queryFn: async () => {
      const db = await getDB();
      const cached = await db.get(STORE_CONFIGURATIONS, vehicleId);
      if (cached) return cached;
      
      const serverConfig = await vehicleApi.getConfiguration(vehicleId);
      await db.put(STORE_CONFIGURATIONS, serverConfig);
      return serverConfig;
    },
    enabled: !!vehicleId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const persistConfiguration = useMutation({
    mutationFn: async ({ config, isOffline = false }) => {
      const validatedConfig = VehicleConfigurationSchema.parse({
        ...config,
        vehicleId,
        version: (config.version || 0) + 1,
        vectorClock: generateVectorClock(deviceId.current, config.vectorClock),
        lastModified: new Date().toISOString(),
        lastModifiedBy: deviceId.current,
        checksum: computeChecksum(config),
      });

      const db = await getDB();
      await db.put(STORE_CONFIGURATIONS, validatedConfig);

      if (!isOffline) {
        try {
          const serverResponse = await vehicleApi.updateConfiguration(vehicleId, validatedConfig);
          await db.put(STORE_CONFIGURATIONS, serverResponse);
          return serverResponse;
        } catch (error) {
          if (error.status === 409) {
            throw { type: 'CONFLICT', serverConfig: error.data, localConfig: validatedConfig };
          }
          throw error;
        }
      }

      await queueForSync(vehicleId, validatedConfig);
      return validatedConfig;
    },
    onMutate: async ({ config }) => {
      await queryClient.cancelQueries({ queryKey: ['vehicleConfiguration', vehicleId] });
      const previousConfig = queryClient.getQueryData(['vehicleConfiguration', vehicleId]);
      
      const optimisticConfig = {
        ...config,
        vehicleId,
        version: (config.version || 0) + 1,
        vectorClock: generateVectorClock(deviceId.current, config.vectorClock),
        lastModified: new Date().toISOString(),
        lastModifiedBy: deviceId.current,
        checksum: computeChecksum(config),
        _optimistic: true,
      };
      
      queryClient.setQueryData(['vehicleConfiguration', vehicleId], optimisticConfig);
      setSyncStatus(SyncStatus.PENDING);
      trackEvent('config_saved', { vehicleId, version: optimisticConfig.version });
      
      return { previousConfig };
    },
    onError: (error, variables, context) => {
      if (context?.previousConfig) {
        queryClient.setQueryData(['vehicleConfiguration', vehicleId], context.previousConfig);
      }
      setSyncStatus(SyncStatus.ERROR);
      
      if (error.type === 'CONFLICT') {
        setSyncStatus(SyncStatus.CONFLICT);
        setPendingConflicts(prev => [...prev, {
          vehicleId,
          localConfig: error.localConfig,
          serverConfig: error.serverConfig,
          timestamp: new Date().toISOString(),
        }]);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['vehicleConfiguration', vehicleId], data);
      setSyncStatus(SyncStatus.SYNCED);
      trackEvent('config_synced', { vehicleId, version: data.version });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicleConfiguration', vehicleId] });
    },
  });

  const queueForSync = async (vehicleId, config) => {
    const db = await getDB();
    await db.add(STORE_SYNC_QUEUE, {
      vehicleId,
      config,
      status: 'pending',
      timestamp: new Date().toISOString(),
      retries: 0,
    });
  };

  const resolveConflict = useMutation({
    mutationFn: async ({ conflictId, strategy, mergedConfig }) => {
      const conflict = pendingConflicts.find(c => c.id === conflictId);
      if (!conflict) throw new Error('Conflict not found');

      let resolvedConfig;
      const serverClock = conflict.serverConfig.vectorClock || {};
      const localClock = conflict.localConfig.vectorClock || {};

      switch (strategy) {
        case ConflictResolutionStrategy.SERVER_WINS:
          resolvedConfig = {
            ...conflict.serverConfig,
            version: conflict.serverConfig.version + 1,
            vectorClock: generateVectorClock(deviceId.current, serverClock),
            lastModified: new Date().toISOString(),
            lastModifiedBy: deviceId.current,
          };
          break;
        case ConflictResolutionStrategy.CLIENT_WINS:
          resolvedConfig = {
            ...conflict.localConfig,
            version: conflict.localConfig.version + 1,
            vectorClock: generateVectorClock(deviceId.current, localClock),
            lastModified: new Date().toISOString(),
            lastModifiedBy: deviceId.current,
          };
          break;
        case ConflictResolutionStrategy.MERGE:
          if (!mergedConfig) throw new Error('Merged config required for merge strategy');
          resolvedConfig = {
            ...mergedConfig,
            vehicleId,
            version: Math.max(conflict.serverConfig.version, conflict.localConfig.version) + 1,
            vectorClock: generateVectorClock(deviceId.current, mergeVectorClocks(serverClock, localClock)),
            lastModified: new Date().toISOString(),
            lastModifiedBy: deviceId.current,
            checksum: computeChecksum(mergedConfig),
          };
          break;
        default:
          throw new Error(`Unknown strategy: ${strategy}`);
      }

      const validatedConfig = VehicleConfigurationSchema.parse(resolvedConfig);
      const response = await vehicleApi.updateConfiguration(vehicleId, validatedConfig);
      
      const db = await getDB();
      await db.put(STORE_CONFIGURATIONS, response);
      
      return { resolvedConfig: response, conflictId };
    },
    onSuccess: ({ resolvedConfig, conflictId }) => {
      queryClient.setQueryData(['vehicleConfiguration', vehicleId], resolvedConfig);
      setPendingConflicts(prev => prev.filter(c => c.id !== conflictId));
      setSyncStatus(SyncStatus.SYNCED);
      trackEvent('conflict_resolved', { vehicleId, conflictId, strategy });
    },
    onError: () => {
      setSyncStatus(SyncStatus.ERROR);
    },
  });

  const syncOfflineQueue = useCallback(async () => {
    if (syncStatus === SyncStatus.SYNCING) return;
    
    setSyncStatus(SyncStatus.SYNCING);
    const db = await getDB();
    const queue = await db.getAllFromIndex(STORE_SYNC_QUEUE, 'by-status', 'pending');
    
    for (const item of queue) {
      try {
        const response = await vehicleApi.updateConfiguration(item.vehicleId, item.config);
        await db.put(STORE_CONFIGURATIONS, response);
        await db.delete(STORE_SYNC_QUEUE, item.id);
        trackEvent('config_synced', { vehicleId: item.vehicleId, version: response.version });
      } catch (error) {
        if (error.status === 409) {
          await db.put(STORE_SYNC_QUEUE, { ...item, status: 'conflict', serverConfig: error.data });
          setPendingConflicts(prev => [...prev, {
            id: item.id,
            vehicleId: item.vehicleId,
            localConfig: item.config,
            serverConfig: error.data,
            timestamp: new Date().toISOString(),
          }]);
          setSyncStatus(SyncStatus.CONFLICT);
        } else if (item.retries < 3) {
          await db.put(STORE_SYNC_QUEUE, { ...item, retries: item.retries + 1 });
        } else {
          await db.put(STORE_SYNC_QUEUE, { ...item, status: 'failed' });
        }
      }
    }
    
    const remaining = await db.getAllFromIndex(STORE_SYNC_QUEUE, 'by-status', 'pending');
    setSyncStatus(remaining.length > 0 ? SyncStatus.PENDING : SyncStatus.SYNCED);
  }, [syncStatus, trackEvent]);

  useEffect(() => {
    let isOnline = navigator.onLine;
    const handleOnline = () => {
      isOnline = true;
      syncOfflineQueue();
    };
    const handleOffline = () => { isOnline = false; };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    if (isOnline) {
      syncOfflineQueue();
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  const getSyncQueueStatus = useCallback(async () => {
    const db = await getDB();
    const pending = await db.getAllFromIndex(STORE_SYNC_QUEUE, 'by-status', 'pending');
    const conflicts = await db.getAllFromIndex(STORE_SYNC_QUEUE, 'by-status', 'conflict');
    const failed = await db.getAllFromIndex(STORE_SYNC_QUEUE, 'by-status', 'failed');
    return { pending: pending.length, conflicts: conflicts.length, failed: failed.length };
  }, []);

  const clearSyncQueue = useCallback(async () => {
    const db = await getDB();
    const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
    await tx.store.clear();
    await tx.done;
    setPendingConflicts([]);
  }, []);

  return {
    configuration: configurationQuery.data,
    isLoading: configurationQuery.isLoading,
    isError: configurationQuery.isError,
    error: configurationQuery.error,
    persistConfiguration: persistConfiguration.mutateAsync,
    persistConfigurationSync: persistConfiguration.mutate,
    isPersisting: persistConfiguration.isPending,
    syncStatus,
    pendingConflicts,
    resolveConflict: resolveConflict.mutateAsync,
    isResolvingConflict: resolveConflict.isPending,
    syncOfflineQueue,
    getSyncQueueStatus,
    clearSyncQueue,
    isAdvancedEditorEnabled,
    deviceId: deviceId.current,
    refetch: configurationQuery.refetch,
  };
};

export default useVehicleConfiguration;