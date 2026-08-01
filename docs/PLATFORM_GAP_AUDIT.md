# LibSwiftRide platform gap audit

Review baseline: `phase-2-development`, 2026-07-29.

## Executive result

LibSwiftRide is no longer a presentation-only project. The repository contains seven React applications, a shared UI/theme package, a typed SDK, an Express API, PostgreSQL/Prisma persistence, Redis integration, WebSocket tracking and database-backed acceptance tests.

The codebase is suitable for continued staging preparation. It is not ready for public production operation because provider certification, real-device validation, multi-replica realtime infrastructure, financial-ledger controls and operational evidence remain open.

## Application inventory

| Product | Implemented foundation | Principal remaining gap |
| --- | --- | --- |
| Public website | Complete public routes, leadership, business, safety and investor presentation | Final owner/legal approval and production analytics/consent decisions |
| Passenger | Quotes, booking, schedules, favourites, tracking, history, receipts, ratings, chat, referrals, passes and delivery views | Complete non-demo authentication UI, real routing/geocoding and device/browser acceptance |
| Driver | Dashboard, availability, GPS streaming, lifecycle actions, SOS, earnings, wallet, incentives and chat | Complete onboarding UI, background-location packaging and poor-network recovery |
| Fleet | Fleet-scoped drivers, vehicles and reporting | Settlement workflow and broader cross-fleet browser tests |
| Dispatcher | Ride queue, drivers and manual assignment | Multi-instance realtime fan-out, operational map layers and load testing |
| Admin | Analytics, KYC, users, promos, reviews, fraud, commission visibility and notifications | Granular staff permissions, MFA, reviewer separation and support-case tooling |
| Business | Corporate account, employees, limits and reporting | Approval-policy UI, invoicing/reconciliation and department administration |

## Backend capability assessment

Implemented and automated:

- JWT access/refresh authentication and account-status revalidation.
- Passenger, driver, fleet manager, dispatcher, business manager, support and admin authorization.
- Ride quotes, idempotent booking, matching and controlled lifecycle transitions.
- SOS escalation, route points, live location/ETA updates and participant chat.
- Fare components, discounts and the enforced 86% driver / 14% platform allocation.
- Wallet transactions, payments, manual Mobile Money confirmation, refunds and payout records.
- Driver KYC, vehicles, availability schedules, incentives and document reminders.
- Corporate employees, fleets, deliveries, passes, campaigns, fraud signals and audit logs.
- Health, readiness, metrics, request logging, redaction and rate limiting.

## Launch-critical gaps

### P0 — required before public production

1. Replace the in-process WebSocket subscription map with authenticated Redis pub/sub or streams for multi-replica delivery.
2. Select and validate Liberia-capable geocoding, routing and navigation providers; current maps do not constitute routing infrastructure.
3. Complete provider certification and signed-webhook testing for Orange Money, MTN MoMo and Stripe. Keep `PAYMENTS_ENABLED=false` until approval.
4. Introduce a reconciled double-entry financial ledger before material live-money operation.
5. Add private KYC document storage, signed upload URLs, malware scanning, retention and access reviews.
6. Run real-device passenger/driver tests, including background GPS, denied permissions, network loss and battery constraints.
7. Complete load, failover, abuse and independent security testing.
8. Prove managed backups, point-in-time recovery and a successful restore/reconciliation drill.
9. Obtain Liberian legal, insurance, tax, privacy, transport and labor review.

### P1 — required for a dependable staged pilot

1. Add complete non-demo registration, verification, login, reset and session-management screens to each applicable client.
2. Add staff MFA and finer-grained permissions beyond broad roles.
3. Add browser automation for every portal and mobile viewport.
4. Add retry/offline UX for booking, GPS, lifecycle and payment confirmation.
5. Expand OpenAPI from the current partial contract and serve the same version from the API.
6. Add support-ticket and safety-case operational workflows.
7. Define GPS retention enforcement and privacy-request automation.

### P2 — scale and optimization

1. PostGIS proximity search and dispatch benchmarking.
2. Demand forecasting, route optimization and driver-performance insights using governed production data.
3. Analytics warehouse and reconciled executive reporting.
4. Native Android/iOS packaging, release automation and app-store readiness.

## Validation evidence

- Prisma Client generation: passed.
- Workspace TypeScript lint scripts: passed across all ten packages.
- API tests: 14 files and 44 tests passed.
- Database-backed acceptance journeys passed for passenger verification, driver approval, booking/dispatch, lifecycle/SOS, refunds, Mobile Money replay protection, corporate/fleet ownership and privileged operations.
- The repository-wide Turbo command currently cannot locate the package-manager shim in this Codex runtime; direct pnpm recursive execution is used for equivalent package checks.

## Safe correction made during this audit

Shared portal navigation no longer hard-codes localhost URLs. Every application now consumes documented `VITE_*_APP_URL` values with local defaults, and the example CORS allow-list includes dispatcher and business development origins.

## Next implementation slice

The next engineering slice should be complete production authentication and session UX for passenger and driver clients, followed by browser automation of the authenticated booking-to-completion journey. This provides higher launch value than adding new feature breadth.
