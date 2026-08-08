# Deployment readiness evidence — 2026-08-08

## Decision

The repository is build-ready for an isolated hosted staging deployment with external payments disabled. It is not approved for production launch. No deployment, DNS change, provider connection, commit or push was performed during this review.

## Code and artifact validation

- All ten TypeScript projects passed direct strict type checking. Project lint scripts are TypeScript checks and were run through the installed compiler because the package-manager wrapper attempted an unavailable registry verification.
- All seven frontends, the API and both shared packages built successfully.
- API tests: 72 passed, including all eight PostgreSQL/Redis-backed acceptance journeys.
- SDK tests: 5 passed.
- Database migrations are current in both local demo and isolated test databases.
- Recovery validation passed with zero ride-allocation, wallet-balance or excessive-refund violations.
- All six primary fictional role accounts successfully authenticated; external payments remained disabled.
- `docker compose config --quiet` passed.
- `git diff --check` passed.
- `.env` is ignored and untracked. The configured public Mapbox token was not found in tracked source.
- Mapbox style access returned HTTP 200. The token shared through chat must be rotated before any public deployment.

## Hosting configuration

- Render Blueprint defines PostgreSQL, Redis, API, public website, passenger, driver, fleet, admin, dispatcher and business services.
- Static frontends expose hosted API/WebSocket, Mapbox and cross-application URL configuration.
- API readiness requires PostgreSQL and Redis.
- Production configuration requires exact HTTPS CORS origins, non-placeholder secrets, protected metrics and an approved routing provider.
- External payments remain disabled and sandbox-selected.

## Local multi-device review

All seven production artifacts returned HTTP 200 on localhost and `192.168.1.150`. A phone or tablet must be on the same trusted Wi-Fi network. Windows Firewall must allow the local Node process on the private network.

The Wi-Fi URLs are temporary and change when the computer's address changes. They use HTTP, so browsers may block real-device geolocation. Use an approved HTTPS staging domain for GPS permission, WebSocket, authentication and complete ride testing.

## Open release gates

1. Rotate the exposed Mapbox public token; create separate restricted web, Android and iOS staging/production tokens with billing alerts.
2. Configure Render protected variables, staging domains, TLS, exact CORS, `wss://` and the approved routing provider.
3. Complete signed Android/iOS background-GPS implementation and the real-device matrix.
4. Validate managed backup/PITR restore, monitoring/paging, low-bandwidth behavior, accessibility, load/failover and independent security testing.
5. Configure protected email/SMS/push, private KYC storage and operational support/safety processes.
6. Obtain applicable Liberian legal, transport, privacy, insurance, tax, labor and consumer-protection approvals.
7. Keep Orange Money, MTN MoMo, Stripe and all live payment calls disabled until separate provider certification and deployment approval.
