# Security baseline

## Controls included

- Argon2 password hashing and minimum 12-character passwords.
- Short-lived signed access tokens and persisted, revocable refresh-token hashes.
- Explicit role checks and ownership checks.
- Helmet headers, restricted CORS origins, payload limits and structured log redaction.
- Signed payment webhooks with constant-time signature comparison.
- Database uniqueness, foreign keys, idempotency keys and audit schema.
- Non-root container runtime and health endpoints.

## Required before launch

1. Add refresh rotation, logout-all, MFA for staff, phone verification and account recovery.
2. Authenticate WebSocket upgrades and authorize every GPS subscription.
3. Add distributed rate limiting, bot defense and credential-stuffing detection.
4. Move secrets to a managed secret store and rotate them on a documented schedule.
5. Encrypt backups and sensitive columns; define GPS, audit and identity retention.
6. Complete threat modeling, dependency/container scans, SAST/DAST and independent penetration testing.
7. Add fine-grained admin permissions, reason codes, just-in-time access and immutable audit export.
8. Complete incident response, breach notification, vendor review and Liberian legal/privacy review.

Never accept raw card data. Use provider-hosted checkout or tokenized SDKs. Verify every webhook from the raw body and make event handling replay-safe.

Report security issues privately to the designated security contact; do not open a public issue.
