import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { FixedSizeList as List, AutoSizer } from 'react-window';
import { performanceProfiler } from '@/utils/performanceProfiler';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useVehicles } from '@/hooks/useVehicles';
import { withErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import './VehicleList.css';

const VehicleListItem = React.memo(({ 
  vehicle, 
  onSelect, 
  onCompare, 
  isSelected, 
  isCompared,
  index,
  style 
}) => {
  const profilerId = `VehicleListItem-${vehicle.id || index}`;
  
  return performanceProfiler.measureRender(profilerId, () => (
    <div 
      className={`vehicle-list-item ${isSelected ? 'selected' : ''} ${isCompared ? 'compared' : ''}`}
      style={style}
      role="listitem"
      aria-selected={isSelected}
      aria-pressed={isCompared}
    >
      <div className="vehicle-image-wrapper">
        <img 
          src={vehicle.imageUrl || '/images/vehicles/placeholder.svg'} 
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          loading="lazy"
          className="vehicle-image"
        />
        {vehicle.badge && (
          <span className={`vehicle-badge ${vehicle.badge.type}`}>{vehicle.badge.text}</span>
        )}
      </div>
      
      <div className="vehicle-details">
        <div className="vehicle-header">
          <h3 className="vehicle-name">
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.trim && <span className="vehicle-trim">{vehicle.trim}</span>}
          </h3>
          <div className="vehicle-price">
            <span className="price-primary">${vehicle.price?.toLocaleString() || 'N/A'}</span>
            {vehicle.msrp && vehicle.price < vehicle.msrp && (
              <span className="price-savings">
                Save ${(vehicle.msrp - vehicle.price).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        
        <div className="vehicle-specs">
          <div className="spec-item">
            <svg className="spec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>{vehicle.engine || 'N/A'}</span>
          </div>
          <div className="spec-item">
            <svg className="spec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>{vehicle.transmission || 'N/A'}</span>
          </div>
          <div className="spec-item">
            <svg className="spec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>{vehicle.drivetrain || 'N/A'}</span>
          </div>
          <div className="spec-item">
            <svg className="spec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            <span>{vehicle.mpg ? `${vehicle.mpg} MPG` : vehicle.range ? `${vehicle.range} mi range` : 'N/A'}</span>
          </div>
        </div>
        
        <div className="vehicle-meta">
          <span className="vehicle-location">{vehicle.dealership?.name}, {vehicle.dealership?.distance} mi</span>
          <span className="vehicle-stock">Stock: {vehicle.stockNumber}</span>
        </div>
      </div>
      
      <div className="vehicle-actions">
        <button
          className={`action-btn compare-btn ${isCompared ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onCompare(vehicle);
          }}
          aria-pressed={isCompared}
          aria-label={isCompared ? `Remove ${vehicle.make} ${vehicle.model} from comparison` : `Add ${vehicle.make} ${vehicle.model} to comparison`}
        >
          <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <span>{isCompared ? 'Compared' : 'Compare'}</span>
        </button>
        <button
          className="action-btn details-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(vehicle);
          }}
          aria-label={`View details for ${vehicle.make} ${vehicle.model}`}
        >
          <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Details</span>
        </button>
      </div>
    </div>
  ));
});

VehicleListItem.displayName = 'VehicleListItem';

const VehicleList = ({ 
  filters = {}, 
  sortConfig = { field: 'price', direction: 'asc' },
  pagination = { page: 1, pageSize: 20 },
  onVehicleSelect,
  onVehicleCompare,
  selectedVehicleIds = [],
  comparedVehicleIds = [],
  className = ''
}) => {
  const telemetry = useTelemetry();
  const { 
    vehicles, 
    loading, 
    error, 
    totalCount,
    refetch,
    fetchTiming 
  } = useVehicles({ filters, sortConfig, pagination });

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (fetchTiming) {
      telemetry.trackPerformance('vehicle_fetch', fetchTiming.duration, {
        vehicleCount: vehicles.length,
        totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
        filters: Object.keys(filters).length,
        sortField: sortConfig.field,
        sortDirection: sortConfig.direction,
        retryAttempt: retryCount
      });
    }
  }, [fetchTiming, vehicles.length, totalCount, pagination, filters, sortConfig, retryCount, telemetry]);

  useEffect(() => {
    const renderProfilerId = 'VehicleList_render';
    performanceProfiler.start(renderProfilerId);
    
    return () => {
      const duration = performanceProfiler.end(renderProfilerId);
      telemetry.trackPerformance('vehicle_list_render', duration, {
        itemCount: vehicles.length,
        page: pagination.page
      });
    };
  }, [vehicles, pagination.page, telemetry]);

  const handleFilterChange = useCallback((newFilters) => {
    telemetry.trackInteraction('filter_change', {
      previousFilters: filters,
      newFilters,
      resultCount: totalCount
    });
  }, [filters, totalCount, telemetry]);

  const handleSortChange = useCallback((newSortConfig) => {
    telemetry.trackInteraction('sort_change', {
      previousSort: sortConfig,
      newSort: newSortConfig
    });
  }, [sortConfig, telemetry]);

  const handlePageChange = useCallback((newPage) => {
    telemetry.trackInteraction('pagination_change', {
      previousPage: pagination.page,
      newPage,
      pageSize: pagination.pageSize
    });
  }, [pagination, telemetry]);

  const handleVehicleSelect = useCallback((vehicle) => {
    telemetry.trackInteraction('vehicle_select', {
      vehicleId: vehicle.id,
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      vehiclePrice: vehicle.price
    });
    onVehicleSelect?.(vehicle);
  }, [onVehicleSelect, telemetry]);

  const handleVehicleCompare = useCallback((vehicle) => {
    const isCurrentlyCompared = comparedVehicleIds.includes(vehicle.id);
    telemetry.trackInteraction('vehicle_compare_toggle', {
      vehicleId: vehicle.id,
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      action: isCurrentlyCompared ? 'remove' : 'add',
      totalCompared: isCurrentlyCompared ? comparedVehicleIds.length - 1 : comparedVehicleIds.length + 1
    });
    onVehicleCompare?.(vehicle);
  }, [comparedVehicleIds, onVehicleCompare, telemetry]);

  const handleRetry = useCallback(() => {
    telemetry.trackInteraction('error_retry', {
      errorMessage: error?.message,
      retryCount: retryCount + 1
    });
    setRetryCount(prev => prev + 1);
    refetch();
  }, [error, retryCount, refetch, telemetry]);

  const itemData = useMemo(() => ({
    vehicles,
    onSelect: handleVehicleSelect,
    onCompare: handleVehicleCompare,
    selectedVehicleIds,
    comparedVehicleIds
  }), [vehicles, handleVehicleSelect, handleVehicleCompare, selectedVehicleIds, comparedVehicleIds]);

  const ItemRenderer = useCallback(({ index, style }) => {
    const vehicle = vehicles[index];
    if (!vehicle) return null;

    return (
      <VehicleListItem
        vehicle={vehicle}
        onSelect={handleVehicleSelect}
        onCompare={handleVehicleCompare}
        isSelected={selectedVehicleIds.includes(vehicle.id)}
        isCompared={comparedVehicleIds.includes(vehicle.id)}
        index={index}
        style={style}
      />
    );
  }, [vehicles, handleVehicleSelect, handleVehicleCompare, selectedVehicleIds, comparedVehicleIds]);

  const EmptyState = useMemo(() => (
    <div className="vehicle-list-empty" role="status" aria-live="polite">
      <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <h3>No vehicles found</h3>
      <p>Try adjusting your filters or search criteria</p>
      <button 
        className="btn btn-primary"
        onClick={() => handleFilterChange({})}
        aria-label="Clear all filters"
      >
        Clear Filters
      </button>
    </div>
  ), [handleFilterChange]);

  const ErrorFallback = useMemo(() => (
    <div className="vehicle-list-error" role="alert">
      <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h3>Unable to load vehicles</h3>
      <p>{error?.message || 'An unexpected error occurred'}</p>
      <div className="error-actions">
        <button 
          className="btn btn-primary"
          onClick={handleRetry}
          disabled={loading}
          aria-label={`Retry loading vehicles (attempt ${retryCount + 1})`}
        >
          {loading ? 'Retrying...' : `Retry (${retryCount + 1})`}
        </button>
        <button 
          className="btn btn-secondary"
          onClick={() => handleFilterChange({})}
          aria-label="Clear filters and retry"
        >
          Clear Filters & Retry
        </button>
      </div>
    </div>
  ), [error, loading, retryCount, handleRetry, handleFilterChange]);

  if (error && vehicles.length === 0) {
    return <ErrorFallback />;
  }

  return (
    <div 
      className={`vehicle-list-container ${className}`}
      role="list"
      aria-label="Vehicle listings"
      aria-busy={loading && vehicles.length === 0}
    >
      <div className="vehicle-list-header">
        <div className="vehicle-list-summary">
          <span className="result-count">
            {totalCount.toLocaleString()} vehicle{totalCount !== 1 ? 's' : ''} found
          </span>
          {filters && Object.keys(filters).length > 0 && (
            <button 
              className="clear-filters-btn"
              onClick={() => handleFilterChange({})}
              aria-label="Clear all filters"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading && vehicles.length === 0 && (
        <div className="vehicle-list-loading" role="status" aria-live="polite">
          <div className="loading-spinner" aria-hidden="true" />
          <span>Loading vehicles...</span>
        </div>
      )}

      {vehicles.length === 0 && !loading && !error && <EmptyState />}

      {vehicles.length > 0 && (
        <AutoSizer disableHeight>
          {({ width }) => (
            <List
              className="vehicle-list"
              width={width}
              height={600}
              itemCount={vehicles.length}
              itemSize={280}
              itemData={itemData}
              overscanCount={5}
              role="list"
              aria-label="Vehicle list"
            >
              {ItemRenderer}
            </List>
          )}
        </AutoSizer>
      )}

      {vehicles.length > 0 && totalCount > pagination.pageSize && (
        <div className="vehicle-list-pagination" role="navigation" aria-label="Pagination">
          <span className="pagination-info">
            Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              aria-label="Previous page"
              aria-disabled={pagination.page <= 1}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.pageSize >= totalCount}
              aria-label="Next page"
              aria-disabled={pagination.page * pagination.pageSize >= totalCount}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

VehicleList.displayName = 'VehicleList';

const VehicleListWithErrorBoundary = withErrorBoundary(VehicleList, {
  fallback: ({ error, resetErrorBoundary }) => (
    <div className="vehicle-list-error-boundary" role="alert">
      <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2