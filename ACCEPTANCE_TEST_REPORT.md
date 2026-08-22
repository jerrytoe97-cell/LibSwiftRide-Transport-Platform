# Phase 6 acceptance test report

Review target: `phase-2-development`  
Review date: 2026-07-28  
Payment mode: disabled/sandbox only

## Automated acceptance coverage

The PostgreSQL/Redis-backed API suite executes these journeys through HTTP:

- passenger registration, verification-token delivery and email confirmation;
- driver registration, onboarding, required KYC documents, submission and admin approval;
- verified driver availability, passenger booking and dispatcher/admin assignment;
- driver acceptance/arrival, passenger boarding, trip start and completion;
- SOS creation during an active ride and durable safety-incident evidence;
- server-authoritative fare settlement, wallet earnings and exact 88%/12% reconciliation;
- cancellation, bounded refund creation and duplicate refund replay;
- admin/support-only manual MTN/Orange confirmation with durable idempotency and audit evidence;
- corporate account/employee ownership, fleet assignment/overview, dispatcher queue and admin audit access.

Contract tests enumerate the Express router and fail if any non-public endpoint lacks authentication. Critical role boundaries are asserted for passengers, drivers, dispatchers, business managers, fleet managers, support and admins. Unit suites cover trip-state rejection, fares, commission rounding, scheduled rides, geofences, fraud scoring, provider signatures, notification/payment retry policy, tracking, receipts and bilingual message-key parity.

## Hardening completed

- Access-token claims are revalidated against the current database account status and role on every protected request. Suspended/deactivated users and stale role claims fail closed.
- Login, verification, password reset, rides, payments, deliveries, corporate, admin, reports and device operations have route-specific rate limits. WebSocket GPS and chat remain limited per authenticated connection.
- Provider calls use bounded eight-second timeouts and two attempts only for transient errors. Idempotency keys remain stable across payment retries.
- Notification retries persist attempt count and exponential backoff, stop after five failures, and survive process restarts.
- Manual Mobile Money confirmation is separate from live provider APIs and requires an operator, evidence reference and unique idempotency record.
- Helmet headers, exact-origin CORS, request IDs and structured redaction remain enabled. Passwords, tokens, payment destinations, KYC storage references and identity references are redacted.
- Mobile layouts now stack forms/actions, retain keyboard focus indicators, respect reduced motion and expose loading/empty states in business and fleet workflows.
- English/French shared labels and ride-status translations have automated key-parity coverage.

## Remaining external launch blockers

1. Official Orange Money Liberia and MTN MoMo API credentials, signed callback specifications, certification and settlement reconciliation.
2. Approved Stripe availability and settlement arrangement for Liberia.
3. Production email, SMS and push vendors with verified sender identities and delivery receipts.
4. Private KYC object storage, signed uploads, malware scanning, access audit and approved retention.
5. Production Render plan/capacity, domains, TLS, exact CORS origins, secrets and rollback exercise. These are intentionally not configured in Phase 6.
6. Managed PostgreSQL PITR settings, independent encrypted backup and a witnessed restore drill meeting RPO/RTO.
7. Real-device GPS/background execution, poor-network, browser accessibility and low-bandwidth acceptance.
8. Load/failover tests for WebSocket fan-out, Redis loss and dispatch concurrency; multi-replica pub/sub remains required.
9. Independent penetration test and remediation evidence.
10. Liberian transport, privacy, tax, insurance, labor and consumer-protection approval.
11. Staffed 24/7 safety escalation, support, KYC review, finance reconciliation and incident command.
12. A production-grade double-entry financial ledger before material live-money volume.

## Decision

| Validation | Result |
| --- | --- |
| `pnpm lint` | Passed across 10 workspaces |
| `pnpm typecheck` | Passed across 10 workspaces |
| `pnpm test` | Passed; API 14 files/44 tests including 5 PostgreSQL/Redis-backed E2E journeys, SDK 3 tests |
| `pnpm build` | Passed across API and all seven frontends |
| Fresh database migration | Passed; all 10 migrations applied to isolated PostgreSQL |
| Health/readiness | Live 200, ready 200 with dependencies; live 200 and ready 503 in 2.4 seconds with Redis stopped |
| Metrics | 401 without token; 200 with token |
| Docker Compose configuration | Passed |
| Secret scan | Passed; no high-confidence credential or configured Mobile Money value in tracked files |
| `git diff --check` | Passed |

The code is ready for an isolated staging candidate on Wednesday, not production. Staging may proceed only from the exact reviewed commit, with `PAYMENTS_ENABLED=false`, isolated staging data/providers, and completion of the unchecked environment, backup, runtime-health and device/browser gates in `STAGING_CHECKLIST.md`. Production remains blocked.
