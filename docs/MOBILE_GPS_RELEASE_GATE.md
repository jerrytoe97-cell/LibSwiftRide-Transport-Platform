# Mobile GPS release gate

The installable driver web app is suitable for foreground real-device staging over HTTPS. It must not be described as production background tracking: iOS and Android browsers may suspend JavaScript and GPS when the screen locks or the app is backgrounded.

Before production, package the driver client as an approved native iOS/Android application and complete these gates:

1. Use an HTTPS API and secure WebSocket endpoint with the existing authenticated, ride-scoped protocol. Keep `PAYMENTS_ENABLED=false` during certification.
2. Request foreground location only after the driver deliberately goes online. Request background location separately, with plain-language purpose and an always-visible tracking state.
3. Android must declare fine, coarse and background location permissions and run active-trip tracking as a foreground service with a persistent notification. Do not request background access before it is operationally required.
4. iOS must provide reviewed When In Use and Always usage descriptions, enable the Location Updates background mode, show the system location indicator and survive suspension/relaunch.
5. Store access tokens in the platform secure key store. Never put tokens in URLs, notifications, analytics or crash reports.
6. Queue a bounded number of encrypted location samples during network loss, preserve UTC capture time, upload in order after reconnect and discard samples outside the active-trip/retention policy.
7. Stop background tracking immediately when the trip ends, the driver goes offline, the account is suspended or the session is revoked.
8. Execute `docs/REAL_DEVICE_TESTING.md` on the signed staging builds. Record aggregate gaps and request IDs, not precise route history.

Release fails if GPS continues while offline, another passenger can subscribe, stale sessions resume tracking, reconnect loses trip ownership, background tracking lacks a persistent OS indicator, or retained route points exceed the configured policy.
