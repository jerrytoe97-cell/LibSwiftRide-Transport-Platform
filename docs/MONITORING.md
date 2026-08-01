# Monitoring and observability

The API emits structured JSON through Pino. Every request receives an `x-request-id`; propagate it through provider hooks and support tooling. Authorization, passwords, tokens, KYC references and storage keys are redacted.

`GET /metrics` exposes Prometheus-format Node.js and HTTP request metrics. Set `METRICS_TOKEN` and scrape with `Authorization: Bearer <token>`. Never expose an unprotected metrics endpoint publicly.

## Core alerts

- Readiness failure for 2 consecutive minutes
- API 5xx rate above 2% for 5 minutes
- p95 API latency above 750 ms for 10 minutes
- PostgreSQL connection saturation or replication lag
- Redis memory eviction, connection failures or stale GPS volume
- Searching rides older than 3 minutes
- Payment webhook failures or reconciliation mismatches
- Notification failure rate above 5%
- KYC queue oldest age above the operating SLA
- Backup failure or restore-test failure

Dashboards should show ride requests, matching latency, completion and cancellation rates, available drivers, GPS freshness, gross bookings, driver earnings, 14% commission, 2% first-ride referral rewards, payment status by provider, notification delivery and KYC throughput.

Logs must use restricted access and short retention. Precise locations belong in Redis with the configured two-minute online TTL; do not add coordinates to logs or metrics.
