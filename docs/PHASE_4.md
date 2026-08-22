# Phase 4 engagement and operations

Phase 4 remains on `phase-2-development`. It does not authorize deployment, Render configuration, production domains, live payment credentials, a pull request, or a merge to `main`.

## Delivered

- Existing scheduled rides, driver availability, online/offline controls, favourite places, promotion management, trip history and earnings dashboards remain server-authoritative and receive the Phase 4 client improvements.
- Referral codes are generated server-side. A referral qualifies exactly once after the referred passenger's first completed trip, earns 2% of that trip's final fare from the platform commission, and is posted through the wallet ledger with an idempotent reference.
- Assigned passengers and drivers can exchange ride-scoped WebSocket messages. Messages are length- and rate-limited, persisted for participant-only history, and unavailable before assignment or after a trip ends.
- Driver KYC documents expiring within 30 days generate one in-app and sandbox-push reminder. An indexed six-hour worker claims reminders transactionally.
- Admins can send audited in-app and sandbox-push broadcasts to one role or an explicit bounded user set.
- Completed-trip participants can download server-generated PDF receipts. The endpoint applies the same authorization and private-cache policy as JSON receipts.
- User locale preferences support `en` and `fr` as a forward-compatible localization foundation. Shared formatting accepts an explicit locale.
- Shared UI now includes keyboard skip navigation, visible focus states, minimum action sizes, improved contrast, responsive table containment and reduced-motion support.
- Live locations still broadcast at high frequency, while database route replay sampling is limited to one point every ten seconds to reduce write load.

## Deferred launch gates

1. Translate and professionally review all customer-facing English and French strings before enabling French as a complete experience.
2. Configure certified push providers and delivery callbacks; sandbox delivery remains the default.
3. Have finance approve referral reward amounts, fraud limits, tax treatment and campaign terms before activation.
4. Run assistive-technology, keyboard-only, low-bandwidth and native-device testing.
5. Replace the minimal PDF renderer if branded, localized, archival or PDF/A receipts become a regulatory requirement.
