# Staging checklist

Use this checklist against one immutable commit on `phase-2-development`. Attach command output, URLs and screenshots to the release record. A checked box means evidence exists, not merely that configuration is planned.

## Change control and secrets

- [ ] The Phase 6 commit SHA and CI results are recorded; required reviews are complete.
- [ ] `git diff --check` and the repository high-confidence secret scan pass.
- [ ] GitHub secret scanning and push protection are enabled; any finding is revoked and investigated, not only removed from Git.
- [ ] Staging uses isolated accounts, PostgreSQL, Redis, provider projects and secrets. No production customer data is copied.
- [ ] GitHub `staging` and `production` environments exist; production requires reviewers and each has its own `RENDER_DEPLOY_HOOK_URL`.

## Required environment

| Variable | Required | Staging rule |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` for a production-equivalent staging runtime |
| `DATABASE_URL`, `REDIS_URL` | yes | Render-managed, isolated services |
| `API_PORT` | yes | `4000` unless the platform injects another port |
| `CORS_ORIGINS` | yes | Exact HTTPS origins for all six frontends; no wildcard |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Separate generated values, at least 32 characters |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` | defaulted | Review `15m` and `30` |
| `PAYMENTS_ENABLED` | yes | `false` until provider certification and official credentials exist |
| `PAYMENT_PROVIDER` | yes | `sandbox` while payments are disabled; `mobile-money` only with approval |
| `PAYMENT_WEBHOOK_SECRET` | yes | Generated value, at least 16 characters |
| `ORANGE_MONEY_API_URL`, `ORANGE_MONEY_API_TOKEN` | conditional | Secret-store values only after Orange certification |
| `ORANGE_MONEY_NUMBER` | conditional | Protected verified recipient number; never commit or expose in admin responses |
| `MTN_MOMO_API_URL`, `MTN_MOMO_API_TOKEN` | conditional | Secret-store values only after MTN certification |
| `MTN_MOMO_NUMBER` | conditional | Protected verified recipient number; never commit or expose in admin responses |
| `STRIPE_PAYMENT_HOOK_URL`, `STRIPE_API_TOKEN` | conditional | Secret-store values only after Stripe approval |
| `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_TOKEN` | conditional | Required to exercise email delivery |
| `SMS_DELIVERY_URL`, `SMS_DELIVERY_TOKEN` | conditional | Required to exercise SMS delivery |
| `PUSH_DELIVERY_URL`, `PUSH_DELIVERY_TOKEN` | conditional | Required to exercise push delivery |
| `METRICS_TOKEN` | production runtime | Generated secret; monitoring sends it as a bearer token |
| `VITE_API_URL`, `VITE_WS_URL` | each frontend build | HTTPS API `/api/v1` and WSS `/ws` URLs |
| `LOG_LEVEL` | optional | `info` unless incident diagnostics require a temporary change |

Never place real values in `.env.example`, Render Blueprint source, logs or release evidence.

## Database and recovery

- [ ] A fresh empty database accepts `pnpm db:deploy`.
- [ ] A copy of the staging schema at the previous release accepts `pnpm db:deploy` without destructive warnings.
- [ ] Migration SQL is reviewed for locks, table rewrites, data loss and version compatibility.
- [ ] A verified snapshot/PITR recovery point is captured before migration.
- [ ] Application rollback uses the prior immutable artifact. Schema recovery uses a reviewed forward fix or authorized PITR; no automatic down migration is run.
- [ ] Restore drill meets RPO 15 minutes and RTO 60 minutes and reconciles rides, payments, wallets and audit records.
- [ ] `DATABASE_URL=<isolated-restored-database> pnpm recovery:validate` exits successfully and its sanitized report is attached.

## Deployment and health

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `docker compose config` and container build pass.
- [ ] The eventual deployment plan includes PostgreSQL, Redis, API, public, passenger, driver, fleet, admin, dispatcher and business services. Render configuration remains intentionally deferred.
- [ ] `/health/live` returns HTTP 200.
- [ ] `/health/ready` returns HTTP 200 only when PostgreSQL and Redis respond, and HTTP 503 when either is unavailable.
- [ ] `/metrics` rejects missing/incorrect bearer tokens and is scraped only over private/TLS networking.
- [ ] Deployment succeeds through the protected Render hook, migrations finish before traffic, and the previous artifact can be redeployed.

## Role and trip tests

Execute and attach the sanitized device matrix from `docs/REAL_DEVICE_TESTING.md`.

- [ ] Passenger: register, verify email, sign in/refresh/reset password, quote, book idempotently, see history/wallet, track and rate a completed ride.
- [ ] Driver: register/onboard, submit KYC references, remain offline until approval, publish GPS, accept a match, progress arriving/arrived/in-progress/completed, see 86% earnings.
- [ ] Fleet manager: access only owned fleet drivers/vehicles, create and validate a vehicle, and cannot read another fleet.
- [ ] Dispatcher: inspect the queue, manually match an eligible driver, and produce an audit event.
- [ ] Admin: review KYC, inspect analytics/reports/audit, manage promos, and exercise authorization denial for non-admins.
- [ ] WebSocket: rejects missing/invalid JWT, rate-limits driver GPS, enforces ride subscription ownership and removes closed subscriptions.
- [ ] Trip lifecycle rejects skipped, reversed and unauthorized state transitions.

## Money and providers

- [ ] Fare and settlement tests demonstrate `driver = fare - round(fare × 14%)` for boundary values; allocations always sum to fare.
- [ ] Database constraints reject negative money and unbalanced allocations.
- [ ] External payment attempts fail while `PAYMENTS_ENABLED=false`; cash remains available.
- [ ] Manual Mobile Money confirmation accepts only pending MTN/Orange payments, is admin/support-only, requires an evidence reference and idempotency key, and writes one durable confirmation plus an audit event.
- [ ] Selecting Orange Money or MTN MoMo displays only the chosen protected recipient number to the authenticated passenger and sends `Cache-Control: private, no-store`.
- [ ] Admin payment settings show configured/not-configured status without returning full recipient numbers.
- [ ] No provider is enabled until official credentials, signed-webhook verification, timeout/retry, duplicate callback, refund and reconciliation evidence exist.
- [ ] Payment webhooks reject bad signatures and do not regress terminal states.
- [ ] Daily gross bookings, 86% driver earnings and 14% platform commission reconcile to provider/cash reports and wallet entries.

## Operations and launch decision

- [ ] Structured logs reach the restricted sink and contain no passwords, tokens, KYC data, payment details or precise locations.
- [ ] Alerts in `docs/MONITORING.md` page the tested on-call rotation.
- [ ] Backup ownership, retention and restore evidence satisfy `docs/BACKUPS.md`.
- [ ] A tabletop exercise validates `docs/INCIDENT_RESPONSE.md`, safety escalation and payment shutdown.
- [ ] Support, safety, finance, KYC, privacy/legal and engineering owners sign the launch record.
- [ ] All blockers in `docs/LAUNCH_READINESS.md` are closed or the accountable executive records a time-bounded risk acceptance.
- [ ] `ACCEPTANCE_TEST_REPORT.md` is attached to the immutable release and all runtime/browser/device gates are evidenced.
