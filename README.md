# LibSwiftRide

LibSwiftRide is an enterprise ride-hailing platform designed for Liberia. This repository is a production-oriented monorepo containing the public website, passenger and driver experiences, fleet operations, administration, and a secure backend API.

> Status: active foundation on the `development` branch. No production credentials belong in this repository.

## Products

| Product | Workspace | Purpose |
| --- | --- | --- |
| Public website | `apps/web` | Marketing, safety, driver and fleet acquisition |
| Passenger app | `apps/passenger` | Quotes, bookings, live trips, payments and receipts |
| Driver app | `apps/driver` | Availability, offers, navigation, trip lifecycle and earnings |
| Fleet portal | `apps/fleet` | Vehicles, drivers, compliance, dispatch and settlements |
| Admin dashboard | `apps/admin` | Operations, safety, pricing, users, payments and audit logs |
| Dispatcher console | `apps/dispatcher` | Live ride queue, manual matching and trip intervention |
| Platform API | `apps/api` | REST API, WebSocket GPS stream and background-ready domain services |

## Architecture

The frontends are React/Vite applications sharing design primitives and API types. The API is Express, TypeScript, Prisma and PostgreSQL. Redis provides ephemeral location/availability storage and a path to queues and rate limiting. GPS updates use authenticated WebSockets; durable trip events and financial records remain in PostgreSQL.

Key business rules are server-owned:

- Drivers receive **88%** of completed-trip fare revenue.
- LibSwiftRide receives a **12%** commission.
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

The default local endpoints are:

- Website: `http://localhost:3000`
- Passenger: `http://localhost:3001`
- Driver: `http://localhost:3002`
- Fleet: `http://localhost:3003`
- Admin: `http://localhost:3004`
- Dispatcher: `http://localhost:3005`
- API and OpenAPI JSON: `http://localhost:4000/api/v1`, `http://localhost:4000/openapi.json`
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

Liberia defaults use `Africa/Monrovia`, `LRD`, and an initial Monrovia service area. Pricing in this foundation is illustrative and must be approved by operations before launch.

## Delivery and governance

CI validates types, tests, builds, dependency integrity and container builds. The deployment workflow calls a protected Render deploy hook and refuses to run when that environment secret is absent.

Changes should enter through feature branches and pull requests. Read [AGENTS.md](AGENTS.md) before automated work. Do not commit secrets, raw identity documents, payment card data, or unrestricted location histories.

## Render

[`render.yaml`](render.yaml) defines PostgreSQL, Redis, the API, and six independently deployed web applications. Create a Render Blueprint, set the frontend API/WebSocket URLs and exact CORS origins, and deploy first to staging. External payments stay disabled until official provider credentials are supplied and certified. Database migrations run as the API pre-deploy command. See [deployment documentation](docs/DEPLOYMENT.md).

## License

Proprietary. Copyright LibSwiftRide. All rights reserved.
