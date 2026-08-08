# Passenger and driver real-device staging test

This procedure prepares production-equivalent evidence without deploying from this repository or enabling live payments. Run it only against an approved isolated staging environment with `PAYMENTS_ENABLED=false`, fictional accounts and cash payment.

## Device matrix

Use at least one current and one lower-spec Android device for both Passenger and Driver, plus one iPhone/Safari passenger device. Record model, OS/browser version, network, battery-saver state and build SHA. Do not record phone numbers, tokens, government IDs or precise route histories in screenshots.

Test foreground location allowed; permission denied and restored; driver backgrounded for 2, 5 and 15 minutes; Wi-Fi/mobile-data handoff; 30 seconds of airplane mode during matching and an active ride; battery saver below 20%; slow or unstable networking; and browser refresh/relaunch during an active trip.

## Complete passenger-to-driver journey

1. Confirm API readiness and that external payments are disabled.
2. Register a fictional passenger, verify email through the staging adapter and sign in.
3. Register a fictional driver, submit non-real KYC test references, approve through staging admin and attach a fictional vehicle.
4. Set the driver available and verify understandable allowed/denied location behavior.
5. Passenger receives a server-priced routed quote and books once. Repeat the same submission and confirm idempotency prevents a second ride.
6. Confirm the driver receives one offer, accepts it once, and the passenger sees the assignment.
7. Move the driver device and verify passenger tracking and ETA; confirm reconnect resumes the same ride after every network/background scenario.
8. Exercise ride chat without sensitive content.
9. Progress through arriving, arrived, passenger boarded and in progress. Confirm skipped or reversed transitions are rejected.
10. Trigger staging SOS and verify only authorized operations users receive the incident.
11. Complete using cash. Verify receipt totals, 86% driver earnings, 14% platform commission, wallet credit and notifications.
12. Submit a rating, revoke the device session, and confirm stale access cannot resume tracking.

## Evidence and pass criteria

Record UTC timestamps, request IDs, sanitized screenshots, reconnect duration and GPS update gaps. Fail the run for unauthorized access, duplicate booking/acceptance/payment, impossible transitions, incorrect allocation, unrecovered tracking, a missing SOS event, tokens in logs or crashes.

A pass requires no P0/P1 defect, tracking recovery within the approved staging SLA, balanced financial records, a usable manual fallback after location denial, active-trip survival through refresh/relaunch, and completion without enabling Orange Money, MTN MoMo or Stripe. Attach the matrix to the immutable staging release record; never commit identifiers, account details or location traces.
