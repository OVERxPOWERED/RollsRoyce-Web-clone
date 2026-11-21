┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Application    │────▶│  Batch Processor │────▶│  OTLP Exporter  │
│  Instrumentation│     │  (5s / 50 events)│     │  (HTTP/JSON)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Sampling Engine │
                       │  (head/tail)     │
                       └──────────────────┘
```

### 1.2 Batching Configuration

| Parameter | Default | Environment Variable | Description |
|-----------|---------|---------------------|-------------|
| Flush Interval | 5000ms | `OTEL_BSP_SCHEDULE_DELAY_MILLIS` | Maximum time to wait before flushing batch |
| Max Batch Size | 50 events | `OTEL_BSP_MAX_QUEUE_SIZE` | Maximum events in queue before forced flush |
| Max Export Batch | 50 events | `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | Events per export request |

### 1.3 Sampling Rates

| Signal Type | Rate | Strategy | Configuration |
|-------------|------|----------|---------------|
| Traces | 10% | Parent-based + TraceID ratio | `OTEL_TRACES_SAMPLER=traceidratio`, `OTEL_TRACES_SAMPLER_ARG=0.1` |
| Errors | 100% | Always sample | `OTEL_TRACES_SAMPLER=always_on` for error spans |
| Metrics | 100% | All metrics exported | No sampling for metrics |
| Logs | 100% | All logs exported | No sampling for logs |

### 1.4 Export Endpoints

```typescript
// Default endpoints (configurable via environment)
const ENDPOINTS = {
  traces: 'https://otel-collector.example.com/v1/traces',
  metrics: 'https://otel-collector.example.com/v1/metrics',
  logs: 'https://otel-collector.example.com/v1/logs',
};

// OTLP JSON Payload Example
const otlpTracePayload = {
  resourceSpans: [{
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: "fleet-management-web" }},
        { key: "service.version", value: { stringValue: "1.2.3" }},
        { key: "deployment.environment", value: { stringValue: "production" }},
        { key: "host.name", value: { stringValue: "browser-client" }}
      ]
    },
    scopeSpans: [{
      scope: {
        name: "@fleet/telemetry",
        version: "1.0.0"
      },
      spans: [{
        traceId: "a1b2c3d4e5f6789012345678901234ab",
        spanId: "f1e2d3c4b5a69788",
        name: "VehicleList.render",
        kind: "SPAN_KIND_INTERNAL",
        startTimeUnixNano: "1699900000000000000",
        endTimeUnixNano: "1699900000015000000",
        attributes: [
          { key: "component", value: { stringValue: "VehicleList" }},
          { key: "render.duration.ms", value: { doubleValue: 15.2 }},
          { key: "virtualization.visibleCount", value: { intValue: 20 }},
          { key: "virtualization.totalCount", value: { intValue: 1500 }},
          { key: "web_vitals.trace_id", value: { stringValue: "a1b2c3d4e5f6789012345678901234ab" }}
        ],
        status: { code: "STATUS_CODE_OK" }
      }]
    }]
  }]
};
```

---

## 2. ErrorBoundary Usage Patterns

### 2.1 Basic Implementation

```tsx
import { ErrorBoundary, ErrorBoundaryFallback } from '@fleet/ui/components/ErrorBoundary';

function VehicleDashboard() {
  return (
    <ErrorBoundary
      fallback={<VehicleListFallback />}
      onError={(error, errorInfo) => {
        // Automatic telemetry reporting
        telemetry.trackError(error, {
          component: 'VehicleDashboard',
          errorBoundary: true,
          componentStack: errorInfo.componentStack,
        });
      }}
      resetKeys={[selectedFleetId]} // Reset on fleet change
      fallbackRender={({ error, resetErrorBoundary, retryCount }) => (
        <ErrorBoundaryFallback
          error={error}
          onReset={resetErrorBoundary}
          retryCount={retryCount}
          maxRetries={3}
          showDetails={process.env.NODE_ENV !== 'production'}
        />
      )}
    >
      <VehicleList fleetId={selectedFleetId} />
    </ErrorBoundary>
  );
}
```

### 2.2 Fallback UI Patterns

```tsx
// VehicleListFallback.tsx
import { useTelemetry } from '@fleet/telemetry/hooks/useTelemetry';

export function VehicleListFallback({ 
  error, 
  onReset, 
  retryCount, 
  maxRetries = 3 
}: ErrorBoundaryFallbackProps) {
  const { trackEvent } = useTelemetry();
  
  const handleRetry = () => {
    trackEvent('error_boundary_retry', {
      component: 'VehicleList',
      retryCount: retryCount + 1,
      errorMessage: error?.message,
    });
    onReset();
  };

  const handleReport = () => {
    trackEvent('error_boundary_report', {
      component: 'VehicleList',
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
    // Open support ticket or feedback modal
  };

  if (retryCount >= maxRetries) {
    return (
      <div className="error-fallback max-retries">
        <h2>Unable to load vehicle list</h2>
        <p>We've tried {maxRetries} times. Please contact support.</p>
        <button onClick={handleReport}>Report Issue</button>
        <button onClick={onReset}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="error-fallback retrying">
      <h2>Something went wrong</h2>
      <p>Attempt {retryCount + 1} of {maxRetries}</p>
      <button onClick={handleRetry} disabled={retryCount > 0}>
        {retryCount > 0 ? 'Retrying...' : 'Retry'}
      </button>
      <button onClick={handleReport}>Report Issue</button>
    </div>
  );
}
```

### 2.3 Error Reporting Integration

```typescript
// telemetry/errorReporter.ts
import { trackError } from '@fleet/telemetry';

interface ErrorReportContext {
  errorBoundary?: boolean;
  componentStack?: string;
  userId?: string;
  fleetId?: string;
  route?: string;
}

export function reportErrorBoundaryError(
  error: Error,
  context: ErrorReportContext
): void {
  // Enrich with ErrorBoundary-specific context
  const enrichedContext = {
    ...context,
    errorBoundary: true,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };

  // Track via telemetry (batched, sampled)
  trackError(error, enrichedContext);

  // Also send to dedicated error tracking service (Sentry, etc.)
  if (window.Sentry) {
    window.Sentry.captureException(error, {
      extra: enrichedContext,
      tags: {
        component: context.componentStack?.split('\n')[1]?.trim() || 'unknown',
        errorBoundary: 'true',
      },
    });
  }
}
```

### 2.4 Reset/Retry Strategies

| Strategy | Use Case | Implementation |
|----------|----------|----------------|
| `resetKeys` | Prop-driven reset | `<ErrorBoundary resetKeys={[fleetId, userId]}>` |
| `onReset` callback | Custom reset logic | `onReset={() => queryClient.invalidateQueries()}` |
| Exponential backoff | Transient errors | `fallbackRender={({ retryCount }) => <RetryButton delay={2 ** retryCount * 1000} />}` |
| Manual reset | User-initiated | `<button onClick={resetErrorBoundary}>Try Again</button>` |

---

## 3. useTelemetry Hook API

### 3.1 Hook Interface

```typescript
// @fleet/telemetry/hooks/useTelemetry.ts
interface TelemetryContext {
  userId?: string;
  fleetId?: string;
  sessionId: string;
  traceId: string;
  spanId: string;
  attributes: Record<string, string | number | boolean>;
}

interface UseTelemetryReturn {
  // Event tracking
  trackEvent: (name: string, attributes?: Record<string, unknown>) => void;
  
  // Error tracking
  trackError: (error: Error, context?: Record<string, unknown>) => void;
  
  // Performance tracking
  trackPerformance: (name: string, duration: number, attributes?: Record<string, unknown>) => void;
  
  // Context management
  setContext: (context: Partial<TelemetryContext>) => void;
  clearContext: () => void;
  getContext: () => TelemetryContext;
  
  // Span management
  startSpan: (name: string, attributes?: Record<string, unknown>) => Span;
  endSpan: (span: Span) => void;
  
  // Web Vitals
  trackWebVital: (metric: WebVitalMetric) => void;
}
```

### 3.2 Usage Examples

```tsx
// Basic event tracking
function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { trackEvent } = useTelemetry();
  
  const handleClick = () => {
    trackEvent('vehicle_card_click', {
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      fleetId: vehicle.fleetId,
      position: 'list',
    });
    navigate(`/vehicles/${vehicle.id}`);
  };
  
  return <div onClick={handleClick}>...</div>;
}

// Performance tracking with context
function VehicleList({ fleetId }: { fleetId: string }) {
  const { trackPerformance, setContext, trackEvent } = useTelemetry();
  
  useEffect(() => {
    setContext({ fleetId });
    const span = startSpan('VehicleList.mount');
    
    return () => {
      endSpan(span);
      trackEvent('vehicle_list_unmount', { fleetId });
    };
  }, [fleetId]);
  
  const renderStart = performance.now();
  
  useEffect(() => {
    const duration = performance.now() - renderStart;
    trackPerformance('VehicleList.render', duration, {
      fleetId,
      vehicleCount: vehicles.length,
      virtualized: true,
    });
  });
  
  // ...
}

// Error tracking with enrichment
function useVehicleMutation() {
  const { trackError } = useTelemetry();
  
  return useMutation({
    mutationFn: updateVehicle,
    onError: (error, variables, context) => {
      trackError(error, {
        operation: 'updateVehicle',
        vehicleId: variables.id,
        fleetId: variables.fleetId,
        mutationState: 'error',
        ...context,
      });
    },
  });
}
```

### 3.3 Context Enrichment

```typescript
// Automatic context enrichment in telemetry provider
function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<TelemetryContext>({
    sessionId: generateSessionId(),
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    attributes: {},
  });

  // Enrich with user context on auth change
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setContext(prev => ({
        ...prev,
        userId: user?.id,
        attributes: {
          ...prev.attributes,
          user_role: user?.role,
          user_tier: user?.subscriptionTier,
        },
      }));
    });
    return unsubscribe;
  }, []);

  // Enrich with route context
  useEffect(() => {
    const unlisten = router.subscribe((route) => {
      setContext(prev => ({
        ...prev,
        traceId: generateTraceId(), // New trace per navigation
        attributes: {
          ...prev.attributes,
          route: route.pathname,
          route_params: JSON.stringify(route.params),
        },
      }));
    });
    return unlisten;
  }, []);

  return (
    <TelemetryContext.Provider value={{ context, setContext }}>
      {children}
    </TelemetryContext.Provider>
  );
}
```

---

## 4. VehicleList Instrumentation Points

### 4.1 Render Timing

```tsx
// VehicleList.tsx - Instrumented component
import { useTelemetry } from '@fleet/telemetry/hooks/useTelemetry';
import { useVirtualizer } from '@tanstack/react-virtual';

export function VehicleList({ fleetId }: { fleetId: string }) {
  const { trackPerformance, trackEvent, startSpan, endSpan } = useTelemetry();
  const parentSpan = useRef<Span | null>(null);
  
  // Mount span
  useEffect(() => {
    parentSpan.current = startSpan('VehicleList.mount', { fleetId });
    return () => {
      if (parentSpan.current) endSpan(parentSpan.current);
    };
  }, [fleetId]);
  
  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: vehicles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });
  
  // Render timing
  const renderStartRef = useRef(performance.now());
  
  useLayoutEffect(() => {
    const renderDuration = performance.now() - renderStartRef.current;
    trackPerformance('VehicleList.render', renderDuration, {
      fleetId,
      totalVehicles: vehicles.length,
      visibleCount: virtualizer.getVirtualItems().length,
      overscan: 5,
    });
    
    // Track virtualization efficiency
    trackEvent('virtualization_metrics', {
      fleetId,
      totalCount: vehicles.length,
      visibleCount: virtualizer.getVirtualItems().length,
      renderDuration,
      scrollTop: virtualizer.getScrollElement()?.scrollTop || 0,
    });
  });
  
  // Scroll tracking (throttled)
  const handleScroll = useThrottledCallback((scrollTop: number) => {
    trackEvent('vehicle_list_scroll', {
      fleetId,
      scrollTop,
      scrollPercentage: scrollTop / (virtualizer.getTotalSize() - window.innerHeight),
      visibleRange: [
        virtualizer.getVirtualItems()[0]?.index,
        virtualizer.getVirtualItems().at(-1)?.index,
      ],
    });
  }, 100);
  
  return (
    <div ref={parentRef} onScroll={(e) => handleScroll(e.currentTarget.scrollTop)}>
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <VehicleCard
          key={vehicles[virtualRow.index].id}
          vehicle={vehicles[virtualRow.index]}
          onClick={(vehicle) => trackEvent('vehicle_card_click', {
            vehicleId: vehicle.id,
            fleetId,
            index: virtualRow.index,
          })}
        />
      ))}
    </div>
  );
}
```

### 4.2 Virtualization Metrics

| Metric Name | Type | Description | Attributes |
|-------------|------|-------------|------------|
| `VehicleList.render` | Histogram | Render duration in ms | `fleetId`, `totalVehicles`, `visibleCount` |
| `virtualization_metrics` | Event | Virtualization efficiency | `totalCount`, `visibleCount`, `renderDuration`, `scrollTop` |
| `vehicle_list_scroll` | Event | Scroll position tracking | `scrollTop`, `scrollPercentage`, `visibleRange` |
| `vehicle_card_click` | Event | Interaction tracking | `vehicleId`, `fleetId`, `index` |

### 4.3 Interaction Tracking