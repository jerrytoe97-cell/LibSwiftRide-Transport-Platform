# Staging readiness — 2026-09-09

Decision: approved for isolated staging with fictional test data only. This is a code/regression readiness decision, not confirmation that a deployed environment has passed operational acceptance. No production deployment, real customer data, or live electronic payments are authorized.

## COMPLETED P0

- PostgreSQL/Redis acceptance environment: `docker-compose.acceptance.yml`, `infra/run-acceptance.ps1`. All 24 previously blocked acceptance cases ran successfully; the expanded final suite also passed. Seventeen migrations applied to the isolated database.
- Session-family refresh/revocation and account-status concurrency: `apps/api/src/auth.ts`, `session-concurrency.acceptance.test.ts`, and migration `202609080001_session_concurrency`.
- Serialized KYC document/submission/review operations and active administrator checks: `apps/api/src/services/kyc-operations.ts`, `active-administrator.ts`, and `kyc-concurrency.acceptance.test.ts`.
- Audited vehicle provisioning and eligibility enforcement for online status, dispatch, assignment and acceptance: `apps/api/src/services/vehicle-provisioning.ts`, `driver-eligibility.ts`, `dispatch.ts`, `routes.ts`, and `vehicle-provisioning.acceptance.test.ts`. Active account, approved KYC, reviewed required documents, an assigned active vehicle, authorized attestation and unexpired compliance/insurance/registration are required. Administrator provisioning UI is in `apps/admin/vehicle-provisioning.tsx`; fleet managers cannot self-authorize enrollment.
- Outbound role/trip/fleet scope authorization, current session checks and private chat participant restrictions: `apps/api/src/services/realtime-authorization.ts`, `server.ts`, and `realtime-authorization.acceptance.test.ts`.
- Balanced cash settlement, commission collection, ledger-backed payouts, refunds, adjustments, reversals and read-only reconciliation: `apps/api/src/services/ledger.ts`, `cash-accounting.ts`, `accounting-adjustments.ts`, `financial-operations.ts`, `reconciliation.ts`, and migration `202609080003_financial_ledger`.
- Concurrent first-ride completion grants one referral reward while preserving both driver allocations: `apps/api/src/referral-concurrency.acceptance.test.ts`.

## REMAINING P0

No failing non-provider P0 regression remains in the scoped local verification. This does not establish the absence of all defects. Deployed environment acceptance and production operational gates below remain unverified; they do not prevent beginning isolated staging with test data.

## DEFERRED MOBILE MONEY INTEGRATIONS

Orange Money, Lonestar/MTN Mobile Money, Stripe and all external electronic payments remain disabled. Both `render.yaml` and `render.production.yaml` set `PAYMENTS_ENABLED=false`; `.env.example` does likewise. `apps/api/src/config.ts` rejects electronic-payment enablement in production. Sandbox adapters and their tests are not provider certification. Signed webhooks, provider reconciliation, electronic refunds/settlement and certification require a later phase and are not current staging blockers.

## P1

- Reduce large frontend/map bundles reported by Vite without changing warning thresholds.
- Broaden browser and deployed multi-instance WebSocket coverage, including refresh/reconnect behavior. Current outbound tests verify the delivery authorization boundary, not an entire network/browser session.
- Expand automated coverage for portals that currently have no unit tests; passing an empty test task does not establish UI coverage.
- Complete operational financial UI and review refund/referral policy before real-money use. Current cash refund policy retains the company-funded referral expense and does not grant a second reward.

## SECURITY READINESS

Scoped security regressions pass: session races, KYC races, suspended administrator denial, vehicle compliance invalidation, role boundaries and outbound ride/fleet scope. Privileged accounting operations enforce active administrators and transaction-scoped audit records. Ledger entries and journals reject updates/deletes and unbalanced posting; production database privileges must also prevent bypass by database owners.

Staging must use separate credentials, databases, storage and fictional identities. Real object-storage/scanner integration, deployed TLS/cookies/CORS, secret provisioning, retention, backup/restore and operational monitoring still require deployment-specific verification before production. No live deployment or external security assessment was performed in this final sequence.

## FINANCIAL READINESS

Cash accounting is verified for staging. Applicable fares use the 86% driver / 14% company allocation with integer-minor-unit rounding defined by the existing fare calculation; arbitrary minor-unit totals cannot represent fractional cents. The one-time 2% referral reward is a company expense, never a deduction from the driver's allocation. Concurrent completion tests prove one reward for the same passenger.

Cash settlements balance. Payout reservations require reconciled ledger-backed payable balances; cash disbursement also checks available recorded cash. Refunds and manual adjustment reversals post balanced, attributable entries. Reconciliation records differences and evidence without changing balances. Legacy wallet balances without matching ledger evidence fail closed rather than receiving invented opening entries. See `CASH_ACCOUNTING.md` for operation semantics and evidence requirements.

## TEST RESULTS

The previously running sequential verification process was recovered and confirmed to have exited successfully. No feature edits or test tolerance changes were made during the final resume.

| Check | Result |
| --- | --- |
| `pnpm test` with isolated PostgreSQL/Redis | 13/13 workspace tasks successful; API freshly ran 332 tests in 52 files, all passed |
| Other workspace suites | SDK 9, driver 10, passenger 16, scanner 8: all passed; unchanged tasks reused successful Turbo cache results |
| Total implemented tests | 375 passed; no failing API tests |
| `pnpm lint --concurrency=1` | 11/11 tasks successful |
| `pnpm typecheck --concurrency=1` | Successful; sequential process continued to builds and exited 0 |
| `pnpm build` | 11/11 tasks successful; non-fatal large-chunk warnings |
| `docker compose config --quiet` | Passed |
| Acceptance Compose configuration | Passed |
| `git diff --check` | Passed; Git emitted line-ending normalization notices |

Final API acceptance results: vehicle provisioning/compliance 23; lifecycle E2E 9; outbound authorization 24; cash accounting 7; financial operations 10; KYC concurrency 4; referral race 1; safety 5; adjustments/reconciliation 4; session concurrency 4; financial role boundaries 7; ledger 7. All passed. Authentication, dispatch, fare, referral, security and remaining unit suites also passed within the 332 total.

Verification used the complete existing working tree, including intentionally preserved development. Turbo reused unchanged successful results (12/13 test tasks, 9/11 lint tasks and 8/11 build tasks); this is not a claim that every cached task reran in the last process. PostgreSQL/Redis API acceptance did rerun. The final sequence did not execute Playwright, a deployed end-to-end browser journey, a Docker image build, load testing or provider certification. API lifecycle tests use real local database state with external-service fixture seams.

## STAGING READINESS

Approved to begin staging with test data only, cash workflows and electronic payments disabled. Apply migrations to an isolated staging database, provision fictional drivers through the audited workflow, and run deployment-specific browser/API smoke checks there. This report does not authorize production or certify the deployed staging infrastructure. The preserved uncommitted changes must be deliberately included or excluded and reverified when assembling a reproducible deployment revision.

## PRODUCTION READINESS

Not approved. Real-data infrastructure validation, deployed browser acceptance, backup/restore rehearsal, monitoring, storage/scanner verification and operational controls remain gates. Electronic integrations remain separately deferred. Nothing was pushed, merged to main or deployed, and no payment enablement was performed.

## Verified commits and preserved work

- `15f6635` — isolated PostgreSQL/Redis acceptance environment.
- `e2c0250` — API security, audited eligibility, cash ledger and regression tests. These changes share transaction and route dependencies and were committed together.
- `95b1564` — provisioning/fleet portals and accounting/API documentation.

Pre-existing unrelated edits remain intentionally uncommitted: environment/provider documentation and sandbox integration work; dispatcher safety and cash UI work; driver/passenger/SDK changes; workspace/package configuration; local Playwright cash/dispatcher fixtures; and the nested `.worktrees/` checkout. They were not discarded. The report itself is committed separately. Repository status therefore is intentionally not globally clean.
