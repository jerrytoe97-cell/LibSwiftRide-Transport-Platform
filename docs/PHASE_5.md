# Phase 5 business operations

Phase 5 adds business travel, fleet scaling, delivery operations and advanced platform controls. It remains a development release: no deployment, production domain, or live Mobile Money provider has been enabled.

## Operational modules

- Corporate accounts have one accountable business manager, an account budget, employee membership and employee-level monthly limits. Ride booking checks both budgets on the API.
- Fleet managers can attach unassigned drivers and remove only drivers who are not on active trips. Every assignment change is audited.
- Incentive programs are time-bound and optionally fleet-scoped. Completion awards are idempotent, credited to the driver wallet once, and separate from the enforced fare split.
- Commission policy is intentionally not runtime-editable. The dashboard displays the enforced 8,600/1,400 basis-point allocation; acknowledgement snapshots accept only those values, and the database permits historical 8,800/1,200 snapshots alongside the current policy.
- Dynamic pricing combines demand with the highest active circular geofence multiplier. Zones are bounded to 1.0–3.0x and are managed by admins.
- Airport bookings persist flight, terminal, arrival and meet-and-greet details for the dispatcher arrival queue.
- Delivery requests use idempotency keys, server-side distance pricing, the same 86/14 split, role-bound transitions and proof-of-delivery references.
- Monthly passes are product-backed, expire, and consume credits atomically. Until a certified subscription payment flow exists, only audited admin grants activate passes.
- Coupon campaigns apply date and budget controls. Campaign spend is recorded with applied ride discounts.
- Booking velocity, failed-payment and account-age signals produce review/block decisions without storing secret or precise-location metadata.

## Security and financial controls

Specialized route limits sit below the global API limit for payments, deliveries, corporate operations, reports and admin endpoints. Corporate access, fleet ownership, driver state and delivery participation are checked server-side. Audit reporting is admin-only and cursor paginated.

Mobile Money adapters remain controlled by `PAYMENTS_ENABLED` and sandbox/provider configuration. Phase 5 does not add credentials, expose configured account numbers, or enable live MTN MoMo or Orange Money.

## Migration and rollback

Migration `202607270003_phase5_business_operations` is additive. Before staging, take and verify a database backup, apply with `pnpm db:deploy`, and run readiness checks. Roll back application code by redeploying the preceding build while leaving additive tables and nullable columns in place. Do not drop Phase 5 data during incident rollback; destructive cleanup requires a separately reviewed migration after retention and backup approval.
