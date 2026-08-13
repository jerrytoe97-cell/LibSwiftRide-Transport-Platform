# Production-readiness audit — 2026-08-13

## Decision

**NOT READY for production. READY for controlled real-device staging only.**

Audited commit: `5dbf888862a07d779295677fe2055a67313735ab` on `phase-2-development`.

Real payments, paid provider services, production domains, production data, and irreversible production changes remain disabled and outside this approval.

## Evidence reviewed

- GitHub CI `31722712737`: migration deploy, dependency audit, lint, typecheck, 82 API tests (including 9 database-backed end-to-end journeys), builds for all ten workspaces, and API container build passed.
- Staging browser smoke `31722712767`: public site plus Passenger, Driver, Admin, Dispatcher, Fleet Manager, and Business Manager desktop/mobile smoke checks passed.
- Direct staging checks: API liveness and readiness returned HTTP 200; readiness reported PostgreSQL and Redis healthy; all seven frontends returned HTTP 200.
- Current code, Prisma migrations/constraints, environment validation, Render Blueprint, security, operations, backup, incident, provider, MFA, GPS, and real-device runbooks.
- Current in-app browser DOM inspection of the deployed Passenger sign-in surface. Screenshot capture timed out, so this audit does not claim a completed visual or accessibility review.

## Readiness matrix

| Area | Result | Evidence | Production gate |
| --- | --- | --- | --- |
| Passenger booking → driver acceptance → live trip → completion | Conditional pass | Database-backed acceptance covers registration, driver verification, idempotent booking/acceptance, ride transitions, SOS, completion, receipt, settlement, cancellation and replay protection. | Complete the same journey on approved physical devices with network interruption and relaunch evidence. |
| Fare and financial allocation | Code pass | Server-authoritative integer minor-unit pricing, database balance constraints, and tests enforce 86% driver / 14% platform. The one-time 2% referral reward comes from platform commission. | Reconcile a real-device cash staging trip and a restore-drill dataset. |
| GPS, routing and maps | Conditional | Authenticated ride-scoped WebSockets, coordinate validation, update throttling, Redis presence TTL, sampled route points, ETA, reconnect behavior in clients, and retention cleanup exist. | Physical-device foreground/background, permission denial/recovery, battery saver, weak network, and map/routing-provider certification remain mandatory. Browser background GPS must not be represented as guaranteed. |
| Notifications | Conditional | Durable queue, retry/backoff, delivery cap, in-app events and sandbox behavior are tested. | Select providers, verify senders, delivery receipts, push behavior and incident paging. Paid providers remain disabled. |
| Passenger/Driver authentication | Pass in automation | Password registration/login, refresh/logout, status revalidation, account recovery and role enforcement pass. MFA is not imposed on these roles. | Physical-device email/recovery and session-revocation checks. |
| Staff MFA | Pass in automation | Admin, Support, Dispatcher, Fleet Manager and Business Manager require TOTP. Enrollment, challenge, encrypted secrets, one-use hashed recovery codes, rotation, MFA-bound tokens, rate limits, logging redaction, audits and session revocation are covered. | Controlled staff recovery drill and operational key-rotation/re-encryption procedure. |
| Admin/Dispatcher/Fleet/Business portals | Conditional pass | Shared MFA UI, role contracts, ownership workflows, builds and desktop/mobile staging smoke pass. | Named-user role matrix, keyboard/screen-reader review, destructive-action reason/approval policy and real-device/tablet review. |
| Authorization and application security | Conditional | Router-wide authentication contract, explicit critical role assertions, ownership checks, active-account revalidation, Argon2, revocable refresh hashes, Helmet, exact production CORS validation, request limits, redaction, webhook signatures and append-only audit records exist. | Distributed rate limiting/bot controls, SAST/DAST/container scan record, threat model, independent penetration test, JIT/fine-grained staff access and immutable external audit export. |
| Data retention and privacy | Conditional | Route-point retention is bounded and active-trip safe; logs avoid precise location. KYC uses references/checksums. | Legal/privacy approval, production retention schedule, private object storage, malware scanning, access logs and deletion/subject-request procedures. |
| Backups and recovery | Documented, not proven | PITR, 35-day snapshots, separate encrypted copy, 15-minute RPO/60-minute RTO and sanitized reconciliation tooling are defined. | Configure managed backups and complete a timed isolated restore drill. This is a hard production blocker. |
| Deployment and runtime | Staging pass | Forward migration, non-root container, liveness/readiness, managed PostgreSQL/Redis and seven hosted frontends are configured; staging is healthy. Production configuration fails closed for unsafe CORS, demo mode, missing metrics/MFA secrets and public demo routing. | Immutable artifact promotion, production secret store/rotation, capacity, TLS/domain, rollback exercise, monitoring sink, alert/paging route and environment isolation. |
| Mobile responsiveness/accessibility | Smoke pass only | Automated desktop/mobile browser smoke passes and semantic Passenger sign-in structure is present. | Current screenshot evidence, keyboard traversal, zoom/reflow, contrast, screen-reader and physical-device testing are not complete. No WCAG conformance claim is approved. |
| Payments | Safely disabled | `PAYMENTS_ENABLED=false`; non-cash provider calls fail closed. Provider adapters, signatures and replay-safe processing exist. | Separate approval after Liberia provider contracts/certification, settlement/refund reconciliation, finance controls and ledger readiness. |

## High-priority findings

1. **Browser GPS cannot satisfy the production background-tracking requirement alone.** Use the current web app for foreground staging; select a native/background-capable delivery path before promising continuous tracking with a locked screen.
2. **Backup controls are runbooks, not demonstrated controls.** Production promotion is blocked until a managed snapshot/PITR restore completes within RPO/RTO and financial reconciliation passes.
3. **Notification and safety escalation are still sandbox/provider-unproven.** SOS creation is tested, but production launch needs an owned, staffed paging path and delivery evidence.
4. **Security assurance is incomplete.** Application controls are meaningful, but distributed abuse protection, independent penetration testing, immutable audit export and privileged access governance remain open.
5. **Visual/accessibility evidence is incomplete.** The deployed DOM is inspectable and automated mobile smoke passes, but the required current screenshots could not be captured by the in-app browser during this audit. Real devices and assistive technology remain the authoritative gate.
6. **The current Render deployment is staging, not approved production.** Custom domains, TLS, production secrets, capacity and provider settings must be established in a separate change-controlled phase.

## Real-device staging gate

Follow `docs/REAL_DEVICE_TESTING.md` and `docs/MOBILE_GPS_RELEASE_GATE.md` against this immutable commit or a later fully validated commit.

Minimum matrix:

- Current Android Passenger and Driver.
- Lower-spec Android Passenger and Driver.
- iPhone/Safari Passenger.
- Tablet or narrow laptop for Dispatcher, Fleet, Admin and Business portals.
- Location allowed, denied and restored; Wi-Fi/mobile handoff; airplane mode; battery saver; background for 2/5/15 minutes; refresh/relaunch during an active trip.

The run fails for any unauthorized access, duplicate ride/acceptance/payment, invalid state transition, incorrect allocation, unrecovered tracking, missing SOS alert, exposed secret/precise location, crash, or inaccessible critical action.

Capture only sanitized evidence: build SHA, device/OS/browser, UTC timestamps, request IDs, GPS gap/reconnect duration, screenshots without credentials or precise route history, and final financial reconciliation.

## Promotion sequence after this audit

1. Complete and sign off the real-device staging matrix.
2. Close P0/P1 defects and rerun every automated gate.
3. Perform backup restore, incident-response and rollback exercises.
4. Complete security, accessibility, privacy/legal and operations approval.
5. Prepare production accounts, secret management, monitoring, capacity and custom domain/TLS under a separate approved change.
6. Certify payment providers and finance reconciliation while the kill switch remains off; enable only after explicit approval.
7. Select native packaging/background-location architecture, complete store privacy disclosures and device certification, then prepare app-store submissions.

No step in this document authorizes real payments, paid provider consumption, production DNS changes, production data use, or app-store submission.
