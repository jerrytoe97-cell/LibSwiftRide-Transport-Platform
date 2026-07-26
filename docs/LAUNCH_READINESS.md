# Production launch review

## Review scope

Reviewed every deployable workspace (`web`, `passenger`, `driver`, `fleet`, `admin`, `dispatcher`, `api`), shared package (`ui`, `sdk`), database migration, Docker artifact, GitHub workflow, Render Blueprint and operations document.

## Controls implemented

- Passenger quote, booking, payment initiation, trip history, ratings, wallet and live ride subscription APIs
- Verified driver availability, GPS, matching, trip lifecycle and 88% earnings settlement
- Fleet-scoped driver/vehicle visibility and vehicle creation
- Dispatcher queue, manual matching and audited intervention
- Admin analytics, promo management, KYC review and operational reports
- Orange Money, MTN MoMo and Stripe provider hooks with production fail-closed configuration
- Email, SMS and push delivery hooks with persistent status and idempotency IDs
- Refresh rotation, role/ownership checks, rate limits, signed webhooks and monotonic payment transitions
- Structured redacted logging, correlation IDs, Prometheus metrics and health checks
- Forward-only Prisma migrations, PostgreSQL constraints and documented PITR/restore strategy
- Docker Compose, Render Blueprint, locked dependencies, CI and Dependabot

## Launch gates requiring external action

Code cannot complete contractual or operational controls on its own. Production remains blocked until accountable owners provide evidence for:

1. Orange Money Liberia and Lonestar Cell MTN certification, production endpoints and settlement tests.
2. Stripe account eligibility and approved Liberia settlement arrangement.
3. Transactional email, SMS and push providers with verified sender identities.
4. Private object storage, signed KYC uploads, malware scanning and retention configuration.
5. Production domains, TLS, exact CORS origins, secrets, monitoring destination and paging rotation.
6. Managed PostgreSQL PITR, encrypted backup copy and successful restore drill.
7. Liberian transport, privacy, tax, insurance, labor and consumer-protection review.
8. End-to-end device, accessibility, low-bandwidth, load, failover and penetration testing.
9. Support, safety incident, emergency escalation, payment reconciliation and KYC reviewer staffing.

## Known engineering follow-ups

- Add full browser/mobile end-to-end suites; current frontend workspaces are build/type validated and SDK/business services have unit tests.
- Replace polling in the dispatcher with event fan-out across replicas.
- Add PostGIS/routing-provider travel estimates; current quote distance/duration inputs are foundation defaults.
- Introduce a double-entry general ledger before money movement beyond the current immutable wallet transaction history.
- Add dedicated safety-case and dispute domains before public launch.

These are explicit launch conditions, not hidden assumptions.
