# Deployment

## Render Blueprint

The repository includes `render.yaml` for:

- Managed PostgreSQL
- Managed Redis
- Docker-based API service
- Public website, passenger, driver, fleet and admin static sites

Create a staging Blueprint first. Render generates database, Redis and JWT values. Operators must configure:

- `CORS_ORIGINS` with exact HTTPS origins
- `VITE_API_URL` as `https://<api-host>/api/v1`
- `VITE_WS_URL` as `wss://<api-host>/ws`
- Payment-provider credentials and signed-webhook secrets
- Email/SMS delivery credentials

The API pre-deploy command applies checked-in Prisma migrations. Render health checks use `/health/ready`.

## Production gates

Before promoting production:

1. Complete provider certification for Orange Money Liberia and Lonestar Cell MTN Mobile Money.
2. Enable Stripe only for an approved Liberian business/payment arrangement.
3. Configure domains, TLS, DNS, secret rotation, database PITR and log retention.
4. Run migration, authentication, booking, GPS, payment and reconciliation tests in staging.
5. Capture a backup and verify the rollback runbook.
6. Require deployment approval and monitor the release for at least one full operating cycle.

The GitHub deployment workflow remains fail-closed until the Render service identifiers and deploy hooks are added as protected environment secrets. This prevents an accidental production deployment from an incomplete configuration.
