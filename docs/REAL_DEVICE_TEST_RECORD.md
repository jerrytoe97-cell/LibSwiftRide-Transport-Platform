# Real-device staging evidence record

Use one copy per approved immutable staging commit. Keep payments disabled and use only fictional accounts, vehicles, KYC references and routes. Do not record credentials, tokens, government IDs or precise location history.

## Automated staging preflight — 2026-08-14

- Verified commit: `046e4e75e780f676efbb9028e29ee48ffd09ad0f`
- GitHub CI: PASS ([run 31758294242](https://github.com/jerrytoe97-cell/LibSwiftRide-Transport-Platform/actions/runs/31758294242))
- Container build: PASS in the same CI run
- Lint, typecheck and production builds: PASS for all workspaces
- Tests: PASS — API 82, SDK 8, Driver location runtime 7; database-backed passenger-to-driver lifecycle and staff MFA acceptance included
- Isolated PostgreSQL dump/restore/reconciliation: PASS; completed-ride allocation and wallet-balance violations both zero
- Desktop/mobile staging browser gate: PASS — 35 passed, one expected desktop skip ([run 31758294243](https://github.com/jerrytoe97-cell/LibSwiftRide-Transport-Platform/actions/runs/31758294243))
- API `/health/live` and `/health/ready`: HTTP 200
- Public website, Passenger, Driver, Admin, Dispatcher, Fleet Manager and Business Manager staging documents: HTTP 200
- Automated offline recovery checks: PASS for Passenger and Driver foreground web sessions
- Physical Passenger/Driver device lifecycle, foreground movement, background suspension behavior, OS permission prompts, notification delivery and SOS operations receipt: **PENDING — do not mark PASS until observed on real devices**

This preflight used only the isolated CI PostgreSQL service for the recovery drill. It did not alter staging or production databases, enable payments, or activate paid notification/map providers.

## Release identity

- Commit SHA:
- Staging release/deployment ID:
- Test date and UTC start/end:
- Test lead:
- `PAYMENTS_ENABLED=false` confirmed:
- API `/health/ready` result:

## Device matrix

| Role | Device model | OS/browser or signed build | Network | Battery saver | Result |
| --- | --- | --- | --- | --- | --- |
| Passenger |  |  |  |  |  |
| Driver |  |  |  |  |  |
| Passenger (lower-spec/current alternate) |  |  |  |  |  |
| Driver (lower-spec/current alternate) |  |  |  |  |  |
| iPhone Passenger |  |  |  |  |  |
| Staff tablet/narrow laptop |  |  |  |  |  |

## Permission evidence

Record the visible prompt wording and result without recording device identifiers.

| Scenario | Expected | Observed/result |
| --- | --- | --- |
| Passenger allows precise while-in-use location | Pickup can use current location |  |
| Passenger denies location | Manual pickup remains usable |  |
| Passenger restores permission in settings | Current location works after retry |  |
| Driver allows precise while-in-use after Go online | Foreground samples begin |  |
| Driver denies location | Clear recovery guidance; no availability/GPS claim |  |
| Staging push prompt | Only approved staging origin/build requested |  |

Do not grant Android **Allow all the time** or iOS **Always Allow** to the web staging app. Those prompts belong only to a later signed native-driver build with the required OS indicator/foreground service implemented.

## Ride lifecycle

| Step | UTC | Sanitized request ID | Result/notes |
| --- | --- | --- | --- |
| Passenger registers/signs in |  |  |  |
| Driver signs in and becomes available |  |  |  |
| Routed quote returned |  |  |  |
| Idempotent booking created once |  |  |  |
| Driver offer received and accepted once |  |  |  |
| Passenger sees assignment and live location |  |  |  |
| Arriving → arrived → boarded → in progress |  |  |  |
| Invalid/skipped transition rejected |  |  |  |
| Staging SOS received by authorized operations role |  |  |  |
| Cash completion and receipt |  |  |  |
| 86/14 allocation reconciled |  |  |  |
| Rating submitted |  |  |  |
| Session revoked; stale session rejected |  |  |  |

## Connectivity and recovery

| Scenario | GPS gap | Reconnect duration | State preserved | Result |
| --- | --- | --- | --- | --- |
| Wi-Fi → mobile data |  |  |  |  |
| 30 seconds airplane mode while matching |  |  |  |  |
| 30 seconds airplane mode during active trip |  |  |  |  |
| Driver app backgrounded 2 minutes |  |  |  |  |
| Driver app backgrounded 5 minutes |  |  |  |  |
| Driver app backgrounded 15 minutes |  |  |  |  |
| Passenger refresh/relaunch |  |  |  |  |
| Driver refresh/relaunch |  |  |  |  |
| Battery saver below 20% |  |  |  |  |

Browser suspension while backgrounded is an expected web-platform limitation, but loss of ownership, duplicate actions, incorrect state, or failure to recover in foreground is a release failure.

## Accessibility and responsive checks

- Critical actions reachable with keyboard/external keyboard:
- Visible focus and skip link:
- 200% zoom/reflow without horizontal loss:
- Screen-reader labels for authentication, booking, ride status, SOS and staff actions:
- Portrait/landscape and safe-area behavior:
- Error messages announced and recovery action understandable:

## Final decision

- P0 defects:
- P1 defects:
- Other defects and issue links:
- Precise locations/tokens/secrets absent from evidence:
- Result: PASS / FAIL
- Passenger tester sign-off:
- Driver tester sign-off:
- Operations/safety sign-off:
- Engineering release sign-off:
