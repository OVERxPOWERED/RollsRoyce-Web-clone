import React, { useMemo, useCallback, useState } from 'react';
import { FixedSizeList as List, AutoSizer } from 'react-window';
import { performanceProfiler } from '@/utils/performanceProfiler';
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
  vehicles = [], 
  onVehicleSelect, 
  onVehicleCompare,
  selectedVehicleId,
  comparedVehicleIds = [],
  filters = {},
  sortConfig = { key: 'price', direction: 'asc' },
  itemHeight = 280,
  windowHeight = 600,
  overscanCount = 5,
  className = '',
  'data-testid': testId
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const processedVehicles = useMemo(() => {
    return performanceProfiler.measure('vehicle-list-processing', () => {
      let result = [...vehicles];
      
      if (filters.make && filters.make.length > 0) {
        result = result.filter(v => filters.make.includes(v.make));
      }
      if (filters.priceRange) {
        result = result.filter(v => 
          v.price >= filters.priceRange.min && v.price <= filters.priceRange.max
        );
      }
      if (filters.yearRange) {
        result = result.filter(v => 
          v.year >= filters.yearRange.min && v.year <= filters.yearRange.max
        );
      }
      if (filters.drivetrain && filters.drivetrain.length > 0) {
        result = result.filter(v => filters.drivetrain.includes(v.drivetrain));
      }
      if (filters.bodyStyle && filters.bodyStyle.length > 0) {
        result = result.filter(v => filters.bodyStyle.includes(v.bodyStyle));
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter(v => 
          `${v.make} ${v.model} ${v.year} ${v.trim || ''}`.toLowerCase().includes(query)
        );
      }
      
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal === undefined || bVal === undefined) return 0;
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
      
      return result;
    });
  }, [vehicles, filters, sortConfig]);
  
  const handleSelect = useCallback((vehicle) => {
    performanceProfiler.mark('vehicle-select', { vehicleId: vehicle.id });
    onVehicleSelect?.(vehicle);
  }, [onVehicleSelect]);
  
  const handleCompare = useCallback((vehicle) => {
    performanceProfiler.mark('vehicle-compare', { vehicleId: vehicle.id });
    onVehicleCompare?.(vehicle);
  }, [onVehicleCompare]);
  
  const handleScroll = useCallback(({ scrollTop: newScrollTop }) => {
    setScrollTop(newScrollTop);
  }, []);
  
  const ItemRenderer = useCallback(({ index, style }) => {
    const vehicle = processedVehicles[index];
    if (!vehicle) return null;
    
    return (
      <VehicleListItem
        key={vehicle.id || index}
        index={index}
        vehicle={vehicle}
        style={style}
        onSelect={handleSelect}
        onCompare={handleCompare}
        isSelected={vehicle.id === selectedVehicleId}
        isCompared={comparedVehicleIds.includes(vehicle.id)}
      />
    );
  }, [processedVehicles, handleSelect, handleCompare, selectedVehicleId, comparedVehicleIds]);
  
  const totalHeight = processedVehicles.length * itemHeight;
  
  return performanceProfiler.measureRender('VehicleList', () => (
    <div 
      className={`vehicle-list-container ${className}`}
      data-testid={testId}
      role="list"
      aria-label="Vehicle listings"
    >
      <div className="vehicle-list-header">
        <div className="results-count">
          {processedVehicles.length} {processedVehicles.length === 1 ? 'vehicle' : 'vehicles'} found
        </div>
        <div className="sort-controls" role="group" aria-label="Sort vehicles">
          <label htmlFor="sort-select" className="visually-hidden">Sort by</label>
          <select
            id="sort-select"
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('-');
              // Sort change would be handled by parent via callback
            }}
            className="sort-select"
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="year-desc">Year: Newest First</option>
            <option value="year-asc">Year: Oldest First</option>
            <option value="mileage-asc">Mileage: Low to High</option>
            <option value="mileage-desc">Mileage: High to Low</option>
          </select>
        </div>
      </div>
      
      {processedVehicles.length === 0 ? (
        <div className="vehicle-list-empty" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="8" x2="14" y2="14" />
            <line x1="14" y1="8" x2="8" y2="14" />
          </svg>
          <h3>No vehicles found</h3>
          <p>Try adjusting your filters or search criteria</p>
        </div>
      ) : (
        <AutoSizer disableHeight>
          {({ width }) => (
            <List
              className="vehicle-list"
              height={windowHeight}
              width={width}
              itemCount={processedVehicles.length}
              itemSize={itemHeight}
              itemData={processedVehicles}
              overscanCount={overscanCount}
              onScroll={handleScroll}
              itemKey={(index) => processedVehicles[index]?.id || index}
            >
              {ItemRenderer}
            </List>
          )}
        </AutoSizer>
      )}
      
      {scrollTop > 100 && (
        <button
          className="scroll-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}
    </div>
  ));
};

VehicleList.displayName = 'VehicleList';

export { VehicleList, VehicleListItem };
export default VehicleList;