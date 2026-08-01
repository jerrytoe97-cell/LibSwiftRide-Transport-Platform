# Launch-readiness report

**Decision: NOT READY for production. Code-ready for an isolated Wednesday staging candidate only if the final Phase 6 validation passes and the runtime gates below are evidenced.**

Review date: 2026-07-28

Review target: `phase-2-development` Phase 6 pre-deployment hardening

Limitation: this phase intentionally did not create a pull request, deploy, configure Render/domains, or enable live payment APIs. Hosted CI and staging runtime evidence must be tied to the final Phase 6 commit.

## Phase 6 acceptance delta

- Added PostgreSQL/Redis-backed HTTP acceptance journeys for passenger verification, driver KYC approval, booking/dispatch, the full ride lifecycle, SOS, settlement, cancellation/refund replay, manual Mobile Money confirmation, corporate/fleet ownership and privileged operations.
- Added a router-wide authentication contract test plus explicit critical-role assertions.
- Revalidates live account status and role for every bearer request, preventing suspended accounts or stale role claims from retaining access.
- Added provider timeout/transient retry policy and durable notification backoff with a five-attempt cap.
- Added durable, audited and idempotent manual Mobile Money confirmation without enabling provider APIs.
- Added shared English/French status vocabulary, responsive controls and clearer loading/empty states.
- Added `ACCEPTANCE_TEST_REPORT.md` with external blockers and staging conditions.

## Readiness summary

| Area | Result | Evidence or remaining gate |
| --- | --- | --- |
| Committed secrets | Pass locally | Only `.env.example` is tracked among environment files; high-confidence token/private-key scan found no match. Enable GitHub secret scanning and review the PR diff again in GitHub. |
| Environment documentation | Pass | `.env.example` and `STAGING_CHECKLIST.md` enumerate API, provider, notification, metrics and Vite variables. Values remain environment-owned. |
| Migrations and rollback | Conditional | Three additive forward migrations and Prisma migration history exist. Take a verified recovery point, test from both empty and previous schemas, and use artifact rollback plus forward fix/PITR—not destructive down migrations. |
| Docker | Conditional | Multi-stage non-root API image and local Compose health/dependency configuration exist. A successful clean container build and runtime smoke result is required for the reviewed SHA. Compose defaults are for development, not staging secrets. |
| Render | Conditional | Blueprint includes managed PostgreSQL/Redis, API pre-deploy migrations, readiness and six static frontends. Exact origins/URLs, protected deploy hooks, plan capacity, domains/TLS and rollback evidence remain external gates. |
| Health and metrics | Code pass; runtime evidence required | Liveness is process-only. Readiness now requires PostgreSQL and Redis. Production config requires a protected metrics token. Exercise 200/503 and metrics 401/200 behavior in staging. |
| Passenger/driver/fleet/dispatcher/admin flows | API acceptance pass pending final run; browser/device gate open | Database-backed HTTP journeys now cover core roles and ownership. Real-device GPS, browser maps, accessibility and poor-network evidence remain staging gates. |
| 86% driver / 14% platform | Pass in domain code | API constants are 8,600/1,400 basis points; company share rounds once and driver receives the remainder. A referrer earns 200 basis points of the referred passenger's first completed ride from the platform share. Unit tests enforce exact allocation, referral eligibility and cent preservation; DB enforces nonnegative balanced splits. |
| Payments disabled without credentials | Pass in code | `PAYMENTS_ENABLED=false` is the default and Render value. Orange Money, MTN MoMo and Stripe calls are rejected while disabled; cash remains available. Production enablement also requires the non-sandbox adapter mode. |
| Logging and monitoring | Conditional | Pino JSON, request IDs, redaction, Prometheus metrics and alert definitions exist. Configure a restricted sink, dashboards, retention and a tested paging route. |
| Backup and incident response | Documented; exercise required | Backup/PITR, restore reconciliation, RPO/RTO and incident roles/procedures are documented. Managed backup settings, restore drill and tabletop evidence remain required. |

## Safe fixes made during this review

- Added an explicit external-payment kill switch and fail-closed production configuration.
- Protected production metrics configuration and added a generated Render metrics token.
- Made readiness depend on both PostgreSQL and Redis.
- Replaced the permanently failing deployment placeholder with a protected, environment-scoped Render deploy hook.
- Added staging evidence, environment, migration, role-flow, finance and operations checklists.
- Added an incident-response runbook and corrected deployment/provider/README guidance.

## Local validation evidence

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed across all nine workspaces |
| `pnpm typecheck` | Passed across all nine workspaces |
| `pnpm test` | Passed: API 9 tests, SDK 2 tests; frontend workspaces currently use `--passWithNoTests` |
| `pnpm build` | Passed across the API and all six frontends |
| `pnpm db:generate` | Passed |
| `pnpm db:deploy` | Passed against local PostgreSQL; three migrations found and no pending migration |
| `docker compose config` | Passed |
| API runtime smoke | `/health/live` 200; `/health/ready` 200 with PostgreSQL/Redis; readiness 503 with Redis stopped |
| Metrics smoke | 401 without bearer token; 200 with the configured token |
| Secret scan | No high-confidence private-key, cloud-key, GitHub, Stripe or Slack token pattern found |
| `git diff --check` | Passed after documentation whitespace correction |
| Clean API image build | Not completed: Docker Desktop could not resolve/pull BuildKit from Docker Hub. This remains a staging gate, not a code pass. |

## Application and service assessment

- **Public website:** deployable static application; production copy, legal notices, accessibility and low-bandwidth testing require owner approval.
- **Passenger:** API supports quotes, idempotent booking, history, wallet, payment initiation, live subscription and ratings. Full sign-in/booking/map/payment browser tests remain a staging gate.
- **Driver:** API supports onboarding/KYC, verified availability, GPS, matching, lifecycle and earnings. Device permission, background GPS, poor-network and safety testing remain gates.
- **Fleet:** fleet-scoped driver/vehicle operations exist. Cross-fleet isolation and settlement/report workflows need end-to-end evidence.
- **Dispatcher:** queue/manual matching and audited intervention exist. Multi-replica real-time fan-out and load behavior remain engineering follow-ups.
- **Admin:** analytics, reporting, promo and KYC controls exist. Privileged-action coverage, reviewer separation and report reconciliation need staging evidence.
- **API/PostgreSQL/Redis:** production-oriented foundation with JWT roles, rate limiting, WebSockets, constraints, idempotency and audit events. Broader integration, load, failover and penetration tests are still required.

## Production blockers

1. Recorded browser/device staging execution for passenger, driver, fleet, dispatcher, admin and business experiences; API HTTP automation does not replace real-device GPS/map validation.
2. Orange Money Liberia and Lonestar Cell MTN certification, official endpoints, signed callback contracts and settlement/refund tests.
3. Stripe account eligibility and an approved Liberia settlement arrangement.
4. Transactional email, SMS and push providers with verified sender identities and delivery receipt/retry tests.
5. Private KYC object storage with signed upload, malware scanning, retention and restricted access.
6. Production domains/TLS, exact CORS origins, secret rotation, log destination, dashboards and tested paging rotation.
7. Managed PostgreSQL PITR, encrypted independent backup copy and successful restore drill.
8. Accessibility, low-bandwidth, load, failover, abuse and independent penetration testing.
9. Liberian transport, privacy, tax, insurance, labor and consumer-protection approval.
10. Staffed support, safety escalation, finance reconciliation, KYC review and incident command.
11. A double-entry general ledger and dedicated safety/dispute domains before material live money movement or public launch.

## Staging approval rule

Deploy only an immutable reviewed SHA from `phase-2-development` after explicit approval. Keep `PAYMENTS_ENABLED=false`. Complete the change-control, environment, database, deployment/health and non-provider role-flow sections of `STAGING_CHECKLIST.md`. Any failed authorization, trip-state, money-allocation, migration, readiness or secret-control test blocks staging promotion.

This report does not approve merging PR #5 or promoting to production.
