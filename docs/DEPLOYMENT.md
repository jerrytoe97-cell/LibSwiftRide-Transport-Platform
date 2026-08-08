# Deployment

## Render Blueprint

The repository includes `render.yaml` for:

- Managed PostgreSQL
- Managed Redis
- Docker-based API service
- Public website, passenger, driver, fleet, admin, dispatcher and business static sites

Create a staging Blueprint first. Render generates database, Redis and JWT values. Operators must configure:

- `CORS_ORIGINS` with exact HTTPS origins
- `ROUTING_API_URL` with an approved HTTPS routing service; production rejects the public OSRM demo endpoint
- `VITE_API_URL` as `https://<api-host>/api/v1`
- `VITE_WS_URL` as `wss://<api-host>/ws`
- `VITE_MAP_PROVIDER=mapbox` only after Mapbox billing approval, with a restricted environment-specific public token in `VITE_MAPBOX_ACCESS_TOKEN`
- All `VITE_*_APP_URL` values as the exact HTTPS origins assigned to the seven hosted frontends
- `PAYMENTS_ENABLED=false` until official provider credentials and certification evidence exist
- Payment-provider credentials and signed-webhook secrets
- `ORANGE_MONEY_NUMBER` and `MTN_MOMO_NUMBER` as protected 10-digit local recipient numbers
- Email/SMS delivery credentials

The API pre-deploy command applies checked-in Prisma migrations. Render health checks use `/health/ready`.

## Mobile Money recipient numbers

Mobile Money recipient numbers are runtime configuration, never source configuration. Set `ORANGE_MONEY_NUMBER` and `MTN_MOMO_NUMBER` in the API service's protected Render environment. Do not add real values to `render.yaml`, `.env.example`, build arguments, frontend variables, logs or release evidence.

The passenger API returns one recipient number only to an authenticated passenger who deliberately selects that Mobile Money method. Responses use `Cache-Control: private, no-store`. The admin payment-settings view reports whether each environment variable is configured but never returns either number.

To rotate a number:

1. Verify the new business account and recipient name through an approved second-person check.
2. Update the matching protected Render environment variable.
3. Redeploy or restart the API.
4. Select that provider in the passenger staging application and confirm the displayed number and recipient name.
5. Record the change and evidence without copying the full number into tickets or logs.

Changing these variables does not enable provider API calls. `PAYMENTS_ENABLED` remains the independent external-payment kill switch.

## Production gates

Before promoting production:

1. Complete provider certification for Orange Money Liberia and Lonestar Cell MTN Mobile Money.
2. Enable Stripe only for an approved Liberian business/payment arrangement.
3. Configure domains, TLS, DNS, secret rotation, database PITR and log retention.
4. Run migration, authentication, booking, GPS, payment and reconciliation tests in staging.
5. Capture a backup and verify the rollback runbook.
6. Require deployment approval and monitor the release for at least one full operating cycle.

The GitHub deployment workflow remains fail-closed until `RENDER_DEPLOY_HOOK_URL` is added to the matching protected GitHub environment. Require reviewers for the `production` environment. Render applies migrations through the Blueprint pre-deploy command and only routes traffic after `/health/ready` confirms PostgreSQL and Redis.
