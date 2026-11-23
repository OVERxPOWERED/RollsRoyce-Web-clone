# 1. Verify flag exists and is in staging
npm run flags:list -- --env=staging --flag=new-checkout-flow

# 2. Enable canary (1% traffic)
npm run flags:update -- --flag=new-checkout-flow --rollout=1 --env=production

# 3. Monitor for 30 minutes (see Analytics Dashboard)
#    Key metrics: error_rate, p99_latency, conversion_rate

# 4. Progress to 5% if healthy
npm run flags:update -- --flag=new-checkout-flow --rollout=5 --env=production

# 5. Continue progression: 25% → 50% → 75% → 100%
#    Minimum 2 hours at each step with clean metrics
```

#### Emergency Rollout (Hotfix)

```bash
# Bypass progressive rollout for critical fixes
npm run flags:update -- --flag=critical-hotfix --rollout=100 --env=production --reason="SECURITY: CVE-2024-XXXX mitigation" --approval=emergency
```

### 1.4 Emergency Kill Switches

| Flag Pattern | Kill Command | Effect | Recovery Time |
|--------------|--------------|--------|---------------|
| `kill-*` | `npm run flags:kill -- --flag=kill-new-checkout` | Immediate disable globally | < 30 seconds |
| `emergency-*` | `npm run flags:emergency-disable -- --flag=emergency-payment` | Disable + alert on-call | < 15 seconds |
| All flags | `npm run flags:kill-all -- --confirm` | Nuclear option - disable ALL flags | < 60 seconds |

**Kill Switch Locations:**
- **CLI:** `npm run flags:kill -- --flag=<flag-name>`
- **Dashboard:** LaunchDarkly → Flags → [flag] → Kill Switch
- **API:** `POST /api/v1/flags/{key}/kill` (requires `admin:flags` scope)

### 1.5 Rollback Criteria

Automatically trigger rollback if **ANY** condition met for 5 consecutive minutes:

| Metric | Threshold | Window | Action |
|--------|-----------|--------|--------|
| `error_rate` | > 5% | 5 min | Rollback to previous rollout % |
| `p99_latency` | > 2000ms | 5 min | Rollback to previous rollout % |
| `conversion_rate` | < 50% of baseline | 10 min | Rollback to 0% (kill) |
| `crash_rate` | > 1% | 5 min | Immediate kill switch |

**Manual Rollback Command:**
```bash
npm run flags:rollback -- --flag=new-checkout-flow --env=production --target=0
```

### 1.6 Flag Audit Trail

All flag changes are logged to:
- **Audit Log:** `https://app.launchdarkly.com/audit-log`
- **CloudWatch:** `/aws/lambda/feature-flag-audit` (retention: 1 year)
- **Slack:** `#feature-flag-changes` (real-time notifications)

**Query Audit Trail:**
```bash
# Last 24 hours for specific flag
npm run flags:audit -- --flag=new-checkout-flow --since=24h

# All emergency actions in last 7 days
npm run flags:audit -- --type=emergency --since=7d
```

---

## 2. Analytics Dashboard

### 2.1 Metric Definitions

| Metric | Definition | Source | Aggregation | Alert Threshold |
|--------|------------|--------|-------------|-----------------|
| `error_rate` | (5xx responses + unhandled exceptions) / total requests | API Gateway + CloudWatch | 1-min rolling | > 5% |
| `p99_latency` | 99th percentile request latency | ALB + X-Ray | 1-min rolling | > 2000ms |
| `p95_latency` | 95th percentile request latency | ALB + X-Ray | 1-min rolling | > 1000ms |
| `throughput` | Requests per second | API Gateway | 1-min sum | < 10 rps (idle) |
| `conversion_rate` | Completed checkouts / initiated sessions | Amplitude | 5-min rolling | < 50% baseline |
| `flag_evaluation_latency` | Feature flag evaluation p99 | LaunchDarkly SDK | 1-min rolling | > 50ms |
| `sync_queue_depth` | Pending configuration sync operations | SQS | 1-min max | > 1000 |
| `websocket_connections` | Active WebSocket connections | API Gateway | 1-min max | > 10000 |
| `cache_hit_rate` | Redis cache hits / total requests | ElastiCache | 5-min rolling | < 80% |

### 2.2 Alerting Thresholds

#### Critical Alerts (Page On-Call Immediately)

| Alert Name | Condition | Duration | Runbook Link |
|------------|-----------|----------|--------------|
| `HighErrorRate` | `error_rate > 5%` | 2 min | [Telemetry Pipeline Degradation](#41-telemetry-pipeline-degradation) |
| `HighP99Latency` | `p99_latency > 2000ms` | 3 min | [Telemetry Pipeline Degradation](#41-telemetry-pipeline-degradation) |
| `SyncQueueBacklog` | `sync_queue_depth > 1000` | 5 min | [Sync Queue Backlog](#43-sync-queue-backlog) |
| `WebSocketStorm` | `websocket_connections > 10000` | 1 min | [WebSocket Connection Storms](#44-websocket-connection-storms) |
| `FlagMisconfig` | Flag evaluation errors > 100/min | 1 min | [Feature Flag Misconfiguration](#42-feature-flag-misconfiguration) |

#### Warning Alerts (Notify On-Call, No Page)

| Alert Name | Condition | Duration | Action |
|------------|-----------|----------|--------|
| `ElevatedP95Latency` | `p95_latency > 1000ms` | 10 min | Investigate within 30 min |
| `LowCacheHitRate` | `cache_hit_rate < 80%` | 15 min | Check Redis memory/eviction |
| `FlagEvaluationSlow` | `flag_evaluation_latency > 50ms` | 10 min | Check LaunchDarkly connectivity |
| `ConversionDrop` | `conversion_rate < 75% baseline` | 30 min | Correlate with flag changes |

### 2.3 Dashboard Access

| Dashboard | URL | Access Level | Description |
|-----------|-----|--------------|-------------|
| **Primary Operations** | `https://grafana.internal.company.com/d/ops-primary` | All Engineers | Golden signals, flag health, sync status |
| **Feature Flags Deep Dive** | `https://grafana.internal.company.com/d/flags-deep-dive` | Platform + Product | Per-flag metrics, rollout progress, kill switch status |
| **Analytics & Conversion** | `https://grafana.internal.company.com/d/analytics-conversion` | Product + Engineering | Funnel metrics, A/B test results, user behavior |
| **Configuration Sync** | `https://grafana.internal.company.com/d/config-sync` | Platform | Queue depth, sync latency, conflict rates, offline status |
| **WebSocket Health** | `https://grafana.internal.company.com/d/ws-health` | Platform | Connection counts, message rates, error patterns |
| **LaunchDarkly Native** | `https://app.launchdarkly.com/projects/production/metrics` | Platform + Leads | Flag evaluations, targeting rules, audit log |

**Access Requests:** Submit via `#access-requests` Slack channel with manager approval.

### 2.4 Custom Dashboard Creation

```bash
# Export dashboard JSON for version control
npm run analytics:dashboard:export -- --dashboard=ops-primary > dashboards/ops-primary.json

# Import dashboard from JSON
npm run analytics:dashboard:import -- --file=dashboards/ops-primary.json
```

---

## 3. Configuration Sync

### 3.1 Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Control    │────▶│  Sync Queue  │────▶│  Target     │
│  Plane      │     │  (SQS FIFO)  │     │  Services   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
             ┌───────────┐ ┌───────────┐
             │ Dead Letter│ │ Offline   │
             │ Queue      │ │ Queue     │
             └───────────┘ └───────────┘
```

### 3.2 Conflict Resolution Procedures

#### Conflict Types

| Type | Detection | Resolution Strategy |
|------|-----------|---------------------|
| **Version Mismatch** | `expected_version != actual_version` | Auto-retry with exponential backoff (max 3) |
| **Schema Violation** | Payload fails JSON Schema validation | Route to DLQ, alert on-call, manual fix |
| **Concurrent Modification** | Optimistic lock failure | Last-write-wins with audit log entry |
| **Dependency Missing** | Referenced resource not found | Queue dependency first, then retry |

#### Manual Conflict Resolution

```bash
# 1. Inspect dead letter queue
npm run config:sync-status -- --queue=dlq --limit=20

# 2. View conflict details
npm run config:sync-inspect -- --message-id=msg-abc123

# 3. Resolve options:
#    a) Retry with current payload
npm run config:sync-retry -- --message-id=msg-abc123

#    b) Retry with modified payload
npm run config:sync-retry -- --message-id=msg-abc123 --payload='{"version": 5, "config": {...}}'

#    c) Discard (with audit reason)
npm run config:sync-discard -- --message-id=msg-abc123 --reason="Obsolete config superseded by msg-xyz789"
```

### 3.3 Offline Queue Monitoring

#### Offline Queue Metrics

| Metric | Healthy Range | Warning | Critical |
|--------|---------------|---------|----------|
| `offline_queue_depth` | 0-100 | 100-500 | > 500 |
| `oldest_message_age` | < 1 hour | 1-6 hours | > 6 hours |
| `reprocessing_rate` | > 100/min | 10-100/min | < 10/min |

#### Monitoring Commands

```bash
# Check offline queue status
npm run config:sync-status -- --queue=offline

# View oldest pending messages
npm run config:sync-status -- --queue=offline --oldest=10

# Trigger offline queue reprocessing
npm run config:sync-reprocess-offline -- --batch-size=50 --dry-run
npm run config:sync-reprocess-offline -- --batch-size=50  # Actually execute
```

### 3.4 Manual Sync Triggers

#### Full Configuration Sync

```bash
# Sync all configurations to all targets
npm run config:sync-trigger -- --scope=full --env=production --confirm

# Sync specific service configuration
npm run config:sync-trigger -- --scope=service --service=payment-api --env=production

# Sync feature flag configurations only
npm run config:sync-trigger -- --scope=flags --env=production
```

#### Selective Sync with Filters

```bash
# Sync only changed configs since timestamp
npm run config:sync-trigger -- --since=2024-01-15T10:00:00Z --env=staging

# Sync specific config keys matching pattern
npm run config:sync-trigger -- --pattern="feature.*" --env=production

# Force sync ignoring version checks (DANGEROUS)
npm run config:sync-trigger -- --force --env=production --reason="Disaster recovery" --approval=emergency
```

### 3.5 Sync Status Verification

```bash
# Comprehensive sync health check
npm run config:sync-status -- --verbose

# Expected output:
# ┌─────────────────┬──────────┬──────────┬────────────┬──────────────┐
# │ Queue           │ Depth    │ Oldest   │ Processing │ Last Sync    │
# ├─────────────────┼──────────┼──────────┼────────────┼──────────────┤
# │ primary         │ 12       │ 2m       │ 45/sec     │ 30s ago      │
# │ offline         │ 0        │ -        │ -          │ 2h ago       │
# │ dead-letter     │ 3        │ 4h       │ -          │ -            │
# └─────────────────┴──────────┴──────────┴────────────┴──────────────┘
# Target Services: 12/12 healthy, 0 degraded, 0 unreachable
```

---

## 4. Incident Response

### 4.1 Telemetry Pipeline Degradation

**Symptoms:** High error rates, elevated p99 latency, missing metrics in dashboards

**Runbook:** `RUNBOOK_TELEMETRY_PIPELINE.md`

#### Triage Steps (First 5 Minutes)

```bash
# 1. Check pipeline health
npm run telemetry:health-check

# 2. Verify collector status
kubectl get pods -n observability -l app=otel-collector

# 3. Check for backpressure
kubectl logs -n observability -l app=otel-collector --tail=100 | grep -i "backpressure\|queue\|throttl"

# 4. Verify exporter connectivity
npm run telemetry:test-exporters -- --env=production
```

#### Resolution Procedures

| Root Cause | Resolution | Verification |
|------------|------------|--------------|
| Collector OOM | Scale collector replicas, increase memory limit | `telemetry:health-check` passes |
| Exporter throttling | Increase exporter batch size/timeout | Queue depth decreases |
| Network partition | Check VPC endpoints, security groups | End-to-end trace completes |
| Schema mismatch | Deploy schema registry update | No validation errors in logs |

#### Escalation

- **5 min:** On-call acknowledges
- **15 min:** Escalate to Platform Lead
- **30 min:** Engage AWS Support if infrastructure-related
- **60 min:** Executive notification

---

### 4.2 Feature Flag Misconfiguration

**Symptoms:** Flag evaluation errors, unexpected feature behavior, kill switch activations

**Runbook:** `RUNBOOK_FLAG_MISCONFIGURATION.md`

#### Triage Steps (First 3 Minutes)

```bash
# 1. Identify affected flags
npm run flags:audit -- --since=10m --type=evaluation-error

# 2. Check flag status
npm run flags:list -- --env=production --status=active --format=json | jq '.[] | select(.evaluationErrorRate > 0)'

# 3. Verify LaunchDarkly connectivity
npm run flags:test-connection -- --env=production