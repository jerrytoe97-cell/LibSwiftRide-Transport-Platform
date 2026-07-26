# Operations

## Environments

Use isolated development, staging and production accounts, databases, Redis instances, credentials and payment projects. Production changes require an approval gate and verified backups.

## Deployment sequence

1. Build immutable frontend and API artifacts from a reviewed commit.
2. Scan dependencies and images, sign artifacts, and publish to the registry.
3. Back up PostgreSQL and run forward-compatible migrations.
4. Roll out API replicas with readiness checks, then frontends.
5. Run authentication, quote, booking, location and sandbox-payment smoke tests.
6. Monitor errors, latency, booking conversion, dispatch time and payment reconciliation.

Rollback application artifacts first. Database rollback uses a reviewed corrective migration or point-in-time recovery, never an automatic destructive down migration.

## Reliability targets

- API availability: 99.9% monthly initial target.
- API p95 latency: under 500 ms excluding provider calls.
- Booking creation success: over 99.5%.
- Payment reconciliation: 100% daily.
- RPO: 15 minutes; RTO: 60 minutes (validate through exercises).

Alert on unavailable dependencies, elevated 5xx/401 rates, dispatch backlog, stale driver locations, unmatched payments, negative allocations and failed backups. Use correlation IDs across requests, jobs and provider calls.

See [Monitoring](MONITORING.md), [Backups](BACKUPS.md), [Providers](PROVIDERS.md), and [KYC](KYC.md) for launch runbooks and control ownership.
