# Repository agent guide

## Mission

Build and maintain LibSwiftRide as a safe, reliable ride-hailing platform for Liberia. Protect passengers, drivers, operators, and financial integrity ahead of delivery speed.

## Repository conventions

- Use pnpm workspaces and TypeScript strict mode.
- Place deployable products in `apps/`, reusable code in `packages/`, infrastructure in `infra/`, and durable decisions in `docs/`.
- Keep domain rules in the API; clients may display estimates but never authoritatively calculate fares, commissions, permissions, or state transitions.
- Store money as integer minor units and timestamps in UTC. Present time in `Africa/Monrovia`.
- Maintain the 88% driver / 12% company split through constants and tests.
- Use UUIDs, explicit database constraints, idempotency keys for payments and bookings, and append-only audit events for privileged actions.
- Never log passwords, tokens, payment details, government IDs, or precise location histories.

## Required checks

Before handing off a change, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

If tooling is unavailable, state exactly which checks could not run. Add tests for business rules, authorization boundaries, financial calculations, ride transitions, and payment webhooks.

## Safety and migrations

- Do not weaken authentication, authorization, rate limits, audit logging, or webhook verification.
- Database migrations must be forward-safe and reviewed; destructive migrations need a staged rollout and backup plan.
- Do not use real customer or driver data in fixtures.
- Provider integrations must use adapters and verified signed webhooks.
- GPS data must have a defined retention period and access policy.

## Git

Do not commit, push, force-push, rewrite history, or open pull requests without explicit user approval. Preserve unrelated local changes. Use conventional commit messages after approval.
