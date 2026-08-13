# Real-device staging evidence record

Use one copy per approved immutable staging commit. Keep payments disabled and use only fictional accounts, vehicles, KYC references and routes. Do not record credentials, tokens, government IDs or precise location history.

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
