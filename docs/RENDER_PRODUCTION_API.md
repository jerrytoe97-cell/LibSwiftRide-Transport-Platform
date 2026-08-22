# Render production API deployment

Use `render.production.yaml` as the Blueprint path. It creates the missing
production backend resources without replacing the seven static frontends.

## Exact service configuration

| Setting | Value |
| --- | --- |
| Type / runtime | Web Service / Docker |
| Name | `libswiftride-api` |
| Region / instance | Frankfurt / Standard |
| Dockerfile | `./Dockerfile` |
| Build command | None; Render builds the Dockerfile with BuildKit |
| Pre-deploy | `node apps/api/node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma` |
| Start (Docker command) | `node apps/api/dist/server.js` |
| Health check | `/health/ready` |
| Listening port | `API_PORT=10000` |

The readiness route checks PostgreSQL and Redis-compatible Key Value access.

## Production dependencies

- `libswiftride-production-postgres`: Postgres 17, Basic 1 GB, Frankfurt,
  internal-only access, storage autoscaling enabled.
- `libswiftride-production-redis`: Key Value Starter, Frankfurt, internal-only
  access, journal-and-snapshot persistence.

Do not reuse `LibSwiftRide-Staging-Redis`. Render injects both internal
connection strings; never copy them into source control.

## Manual Render values

Enter these `sync: false` variables without committing their values:

- `CORS_ORIGINS` is committed as the seven exact Render HTTPS origins: `web`,
  `passenger`, `driver`, `fleet`, `admin`, `dispatcher`, and `business` under
  `libswiftride-<name>.onrender.com`. It is not a secret and needs no manual value.
- `GOOGLE_MAPS_SERVER_API_KEY`: server-restricted key with Routes API access.
- `VITE_GOOGLE_MAPS_BROWSER_API_KEY`: configure separately on every static
  frontend, restricted to the seven production HTTPS origins and to Maps
  JavaScript API and Places API (New).
- `ZOHO_SMTP_APP_PASSWORD`: app password for `support@libswiftride.com`.
- `RESEND_API_KEY`: retain the existing key for rollback; Zoho remains selected.
- `ORANGE_MONEY_NUMBER` and `MTN_MOMO_NUMBER`: required only when enabling live
  payments; leave payments disabled until provider/webhook setup is complete.

Render generates the JWT, MFA, payment-webhook, and metrics secrets declared in
the Blueprint. Do not place their generated values in the repository.

## Deployment order

1. Create a Blueprint from this repository with path `render.production.yaml`.
2. Confirm all three resources are new and located in Frankfurt.
3. Supply the `sync: false` values during initial creation. For an existing
   Blueprint, add them on the API service Environment page because later syncs
   ignore new `sync: false` declarations.
4. Apply the Blueprint; Prisma migrations run before traffic switches.
5. Verify `GET /health/live` and `GET /health/ready` both return HTTP 200.
6. Copy the actual API hostname from Render. For every static frontend set
   `VITE_API_BASE_URL=https://<actual-api-host>/api/v1` and
   `VITE_WS_URL=wss://<actual-api-host>/ws`, then redeploy it.
7. Test login, verification, password reset, support, notification email, and
   WebSocket flows. Keep `PAYMENTS_ENABLED=false` until live payment credentials
   and signed webhook verification are ready.
