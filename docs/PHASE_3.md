# Phase 3 operations

Phase 3 remains on `phase-2-development`. It does not authorize deployment, a pull request, production domains, live payment credentials, or a merge to `main`.

## Operational capabilities

- The authoritative lifecycle is assignment, driver acceptance, arrival, passenger boarding confirmation, trip start, completion or cancellation. Every transition is role-bound and appended to ride events.
- Driver GPS is kept in Redis for live presence and sampled into ride-scoped route points for participant-authorized replay. Live messages include remaining distance and ETA. Precise coordinates must follow the retention and restricted-access policy in `SECURITY.md`.
- Final fares preserve integer minor units and separately record the dynamic multiplier, waiting time after the grace period, tolls, discounts, driver earnings and platform commission. The 86/14 split is recalculated over the final collected fare.
- Electronic trips cannot complete until a signed provider callback confirms the exact final amount. Cash and wallet payments create auditable payment and wallet records. Provider adapters remain disabled unless explicit non-live configuration enables them.
- Refunds require an idempotent request and admin review. Driver payouts debit the driver wallet and create a unique payout record; provider settlement remains an adapter concern.
- SOS incidents notify active operations responders and create audit and ride events without copying precise coordinates into logs. Emergency contacts and expiring, revocable trip-share tokens support personal safety.
- Analytics expose ride conversion, acceptance and trip duration, unique riders, active drivers, payment mix, revenue allocation, discounts, waiting fees, tolls, growth and safety volume.

## Production gates still open

1. Obtain provider certification and signed webhook/refund specifications before enabling any live payment provider.
2. Configure a jurisdiction-reviewed emergency-response playbook and staffed escalation rota.
3. Validate the configured 30-day route-point retention period with privacy/legal owners and capture staging cleanup evidence.
4. Load-test WebSocket fan-out and move route sampling to an asynchronous ingestion worker before high-volume launch.
5. Reconcile payouts and refunds against provider settlement files before enabling automated disbursement.
