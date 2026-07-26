# Phase 2 development

Phase 2 runs only on `phase-2-development`. It does not authorize a merge, pull request, deployment, production domain, or live payment credential. Deployment work remains deferred until the separately approved Wednesday window.

## First increment

- Passenger booking now connects to paginated ride history, ratings, notifications and authenticated WebSocket ride tracking.
- Driver home now reads a consolidated dashboard, publishes GPS only while online, shows verification/vehicle state and advances the authorized trip lifecycle.
- Dispatcher operations now list eligible available drivers and support audited manual assignment.
- Admin operations now show 30-day completion/earnings/commission reporting and promotion utilization.
- Ride history rejects roles without an ownership model, returns cursor metadata and limits relation fields.
- Promotion validation calculates bounded integer-minor-unit discounts in the API.
- Notification reads include unread counts and bounded result sizes.
- Database indexes support passenger history, driver earnings, payment operations, promotion expiry and audit chronology.
- All API responses use `Cache-Control: no-store`; authentication, authorization, payment gates and Mobile Money runtime configuration are unchanged.

## Deferred

- Render changes, deployment hooks, domains, DNS and TLS
- Live Orange Money, MTN MoMo or Stripe credentials and provider calls
- Production push/email/SMS provider activation
- Pull request creation or any merge into `main`
- Concurrent online index creation for high-volume production tables; the Phase 2 migration is transactional and must be applied before those tables grow materially

## Next increments

1. Add database-backed integration tests with isolated fixtures for role flows and pagination.
2. Add accessible session/onboarding flows to each role application.
3. Add Redis fan-out for WebSocket events across API replicas.
4. Add location retention jobs and explicit user-facing GPS consent controls.
5. Add immutable promotion-redemption reservations to prevent concurrent overuse.
6. Add chart-ready daily analytics queries and export jobs.
