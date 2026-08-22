# LibSwiftRide

> For the complete fictional local experience, see [DEMO_GUIDE.md](DEMO_GUIDE.md).

LibSwiftRide is an enterprise ride-hailing platform designed for Liberia. This repository is a production-oriented monorepo containing the public website, passenger and driver experiences, fleet operations, administration, and a secure backend API.

> Status: Phase 6 pre-deployment hardening on `phase-2-development`. No production credentials belong in this repository, and live payment APIs remain disabled.

## Products

| Product | Workspace | Purpose |
| --- | --- | --- |
| Public website | `apps/web` | Marketing, safety, driver and fleet acquisition |
| Passenger app | `apps/passenger` | Quotes, bookings, live trips, payments and receipts |
| Driver app | `apps/driver` | Availability, offers, navigation, trip lifecycle and earnings |
| Fleet portal | `apps/fleet` | Vehicles, drivers, compliance, dispatch and settlements |
| Admin dashboard | `apps/admin` | Operations, safety, pricing, users, payments and audit logs |
| Dispatcher console | `apps/dispatcher` | Live ride queue, manual matching and trip intervention |
| Business portal | `apps/business` | Corporate budgets, employee travel policy and account reporting |
| Platform API | `apps/api` | REST API, WebSocket GPS stream and background-ready domain services |

## Architecture

The frontends are React/Vite applications sharing design primitives and API types. The API is Express, TypeScript, Prisma and PostgreSQL. Redis provides ephemeral location/availability storage and a path to queues and rate limiting. GPS updates use authenticated WebSockets; passenger tracking automatically resumes active rides, reconnects with bounded backoff, and falls back to an authorized tracking snapshot while the socket recovers. Durable trip events and financial records remain in PostgreSQL.

Key business rules are server-owned:

- Drivers receive **86%** of completed-trip fare revenue.
- LibSwiftRide receives a **14%** commission.
- All money is stored as integer minor units (Liberian cents).
- Ride and payment state changes are idempotent and auditable.
- Payment providers are integrated behind an adapter; the included sandbox provider enables local development.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Security](docs/SECURITY.md), [Operations](docs/OPERATIONS.md), [Monitoring](docs/MONITORING.md), [Backups](docs/BACKUPS.md), [Incident response](docs/INCIDENT_RESPONSE.md), the [staging checklist](STAGING_CHECKLIST.md), and the [launch-readiness report](docs/LAUNCH_READINESS.md).

## Quick start

Requirements: Node.js 22+, Corepack/pnpm, Docker Desktop, and Git.

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The local PostgreSQL container also creates an isolated `libswiftride_test`
database owned by the test role on first startup. Apply migrations to it before
running the database-backed acceptance suite:

```bash
DATABASE_URL=postgresql://test:test@localhost:5432/libswiftride_test pnpm db:deploy
pnpm test
```

The default local endpoints are:

- Website: `http://localhost:3000`
- Passenger: `http://localhost:3001`
- Driver: `http://localhost:3002`
- Fleet: `http://localhost:3003`
- Admin: `http://localhost:3004`
- Dispatcher: `http://localhost:3005`
- Business: `http://localhost:3006`
- API and OpenAPI contract: `http://localhost:4000/api/v1`, `http://localhost:4000/openapi.yaml` (`/openapi.json` redirects to the canonical YAML document)
- Health checks: `http://localhost:4000/health/live`, `http://localhost:4000/health/ready`

Seeded accounts are intentionally not included. Create users through the registration endpoint in non-production environments.

## Common commands

```bash
pnpm dev             # start every workspace in watch mode
pnpm build           # production builds
pnpm lint            # static analysis
pnpm typecheck       # TypeScript checks
pnpm test            # unit/integration tests
pnpm db:migrate      # apply a development migration
pnpm db:deploy       # apply checked-in migrations
pnpm compose:up      # full container stack
```

## Configuration

Copy `.env.example` to `.env`. At minimum, replace JWT secrets. External payment methods remain disabled unless `PAYMENTS_ENABLED=true`; only enable them after official credentials and staging certification. CORS origins, database URLs, metrics access and payment webhook secrets are environment-specific.

Production maps use Google Maps Platform with `VITE_MAP_PROVIDER=google` and a website-restricted `VITE_GOOGLE_MAPS_BROWSER_API_KEY`. The API uses a separate server-only `GOOGLE_MAPS_SERVER_API_KEY` for authoritative Routes API distance, duration and route geometry. Without the browser key, clients retain the OpenStreetMap-derived preview for non-production use.

Passenger road routes are calculated by the API through the routing adapter (`ROUTING_API_URL`, defaulting to the public OSRM demo endpoint, and `ROUTING_TIMEOUT_MS`). The API returns route geometry, road distance, and duration, then authoritatively calculates the fare from those server-obtained metrics. Ride creation recalculates the route and price instead of trusting values supplied by the browser. Configure an approved or self-hosted routing service with an operational SLA before production; the public demo service is for development only.

Web push is opt-in. Set `VITE_WEB_PUSH_PUBLIC_KEY` to the public VAPID key to expose the enable-notifications control in Passenger and Driver portals. Browser subscriptions are stored through `/devices`; ride acceptance, arrival, boarding, start, completion, and cancellation queue both in-app and push notifications. Production delivery still requires the signed provider adapter configured by `PUSH_DELIVERY_URL` and `PUSH_DELIVERY_TOKEN`; never place the private VAPID key in a Vite variable.

Liberia defaults use `Africa/Monrovia`, `LRD`, and an initial Monrovia service area. Pricing in this foundation is illustrative and must be approved by operations before launch.

## Delivery and governance

CI validates types, tests, builds, dependency integrity and container builds. The deployment workflow calls a protected Render deploy hook and refuses to run when that environment secret is absent.

The API acceptance suite exercises registration, email verification, driver KYC approval, dispatch, the complete ride lifecycle, SOS, fare settlement, cancellation/refund replay protection, manual Mobile Money confirmation, corporate/fleet ownership and privileged operations against PostgreSQL and Redis. See [Acceptance test report](ACCEPTANCE_TEST_REPORT.md).

Changes should enter through feature branches and pull requests. Read [AGENTS.md](AGENTS.md) before automated work. Do not commit secrets, raw identity documents, payment card data, or unrestricted location histories.

## Render

[`render.yaml`](render.yaml) defines PostgreSQL, Redis, the API, and six independently deployed web applications. Create a Render Blueprint, set the frontend API/WebSocket URLs and exact CORS origins, and deploy first to staging. External payments stay disabled until official provider credentials are supplied and certified. Database migrations run as the API pre-deploy command. See [deployment documentation](docs/DEPLOYMENT.md).

## License

Proprietary. Copyright LibSwiftRide. All rights reserved.
