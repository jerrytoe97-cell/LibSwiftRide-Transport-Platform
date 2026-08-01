# Phase 2 development

Phase 2 runs only on `phase-2-development`. It does not authorize a merge, pull request, deployment, production domain, or live payment credential. Deployment work remains deferred until the separately approved Wednesday window.

## First increment

- Passenger booking now connects to paginated ride history, ratings, notifications and authenticated WebSocket ride tracking. Active rides resume tracking after a page reload, reconnect with bounded exponential backoff, and use the participant-authorized tracking endpoint as a 15-second fallback when socket delivery is interrupted.
- Passenger cancellation uses an explicit confirmation step and a structured reason. The API remains responsible for validating the ride transition, releasing the assigned driver, recording the durable ride event, and notifying the other participant.
- Passenger SOS uses a deliberate confirmation screen with medical, security, crash, harassment, and other categories. It requests the passenger's current GPS position, still sends when location permission is unavailable, creates an audited safety incident, and queues urgent in-app and push alerts for authorized safety responders.
- Assigned-driver cards now show the API-calculated rating average and count. Hidden reviews are excluded, unrated drivers receive an honest new-driver state, and clients never calculate the authoritative aggregate themselves.
- Passenger receipts now show an API-supplied itemized fare, route, completion time in Monrovia, payment status, driver and vehicle, refunds, promotions, and the enforced driver/platform allocation. The downloadable PDF carries the same core settlement details.
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

## Second increment

- Scheduled rides activate into dispatch five minutes before pickup and are bounded to 15 minutes–30 days ahead.
- Passenger favourite places support Home, Work and custom labels; completed trips expose participant-authorized receipts and full fare breakdowns.
- Saved places display recognizable Home, Work and favorite icons and can populate either side of a new booking without retyping the address.
- The passenger referral wallet displays only API-issued referral statuses, ledger-backed wallet balance and credited reward totals; clients do not manufacture loyalty balances.
- Passenger offer banners list only active, unexpired API-managed promotions and apply their code to the next server-calculated estimate.
- Promotion and referral-wallet controls share the passenger's English/French locale, including dates and interaction feedback.
- Ride chat, delivery, monthly-pass and passenger empty-state controls use the same English/French message catalog.
- Passenger SOS, cancellation and ride-history controls preserve canonical API values while displaying localized labels.
- Active-ride payment guidance and itemized passenger receipt totals, adjustments and timestamps follow the selected locale.
- Emergency GPS disclosure and cancellation-consequence guidance are localized without changing the safety event or cancellation payload sent to the API.
- The core passenger booking, safety and receipt journey has aligned English and French messages, while the passenger's locale preference remains stored by the API.
- Driver dashboards include wallet balance, performance, ride history and non-overlapping availability windows.
- Dispatchers receive live Redis-backed driver locations, manual assignment and audited offline/suspension controls.
- Admin operations include driver KYC decisions, passenger lifecycle controls, promotion activation and review moderation.
- Commented ratings enter moderation while score-only ratings publish immediately.
- Users can inspect and revoke their own refresh sessions; suspending passengers revokes active refresh sessions.
- Email and push delivery remain sandbox-only by default through `NOTIFICATION_PROVIDER=sandbox`.
- Narrow rate limits protect password reset, ride and payment routes in addition to the global API limits.
