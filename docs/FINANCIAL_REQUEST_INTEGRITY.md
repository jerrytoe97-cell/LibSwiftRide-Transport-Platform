# Financial request integrity

This change hardens refund requests, refund review, and driver payout reservations. It does not execute provider refunds or payouts, enable payment providers, introduce a general ledger, or approve production operation.

## Contract

- `POST /rides/:id/refunds` remains Admin/Support-only and returns 201. A captured payment is required for a new request. Requested, approved, processing, and completed refunds reserve the payment amount; rejected and failed refunds do not.
- `POST /admin/drivers/:id/payouts` remains Admin-only and returns 201. A new payout atomically reserves available wallet funds and creates a pending payout, wallet entry, and audit event.
- Identical idempotency-key retries return the original record without additional mutations or audit events, even after the wallet is drained or the payment state changes. Refund keys bind the ride, amount, and normalized reason. Payout keys bind the driver, amount, and UTC period. Reusing a key with different details returns 409 `IDEMPOTENCY_KEY_REUSED`.
- `PATCH /admin/refunds/:id` remains Admin-only. Only `REQUESTED` may change to `APPROVED` or `REJECTED`. Repeating the same decision returns the existing record without changing its reviewer or adding an audit event. Other transitions return 409 `REFUND_NOT_REVIEWABLE`; missing refunds return 404 `REFUND_NOT_FOUND`.
- No provider call occurs inside these transactions. Approval is not confirmation that a refund has been delivered.

## Concurrency and audit

These operations use PostgreSQL serializable transactions. Payout deductions additionally require `balanceMinor >= amountMinor` in the update predicate. Serialization conflicts and concurrent idempotency-key insert collisions retry the entire rolled-back transaction up to four attempts. Exhaustion returns 409 `FINANCIAL_CONFLICT`; the caller must keep the same key and request details when retrying.

Financial records, wallet deductions/entries, and associated audit events commit or roll back together. Rejected operations do not leave a partial financial mutation. The 86% driver / 14% platform allocation and referral rules are unchanged. No schema migration is required for this increment.

## Verification

`apps/api/src/financial.acceptance.test.ts` exercises the existing HTTP routes against the isolated test database, covering full-amount retries, concurrent payout/refund requests, key conflicts, final review decisions, and passenger authorization denials. Fixtures are fictional and include opening wallet entries so recovery reconciliation remains valid.

Run after applying existing migrations to the isolated test database:

```sh
pnpm --filter @libswiftride/api exec vitest run src/financial.acceptance.test.ts --maxWorkers=1
```

Database-backed concurrency evidence is required before promotion. Remaining financial work includes provider execution and callbacks, payout completion/failure recovery, partial-refund reconciliation, a double-entry ledger, and operational approval workflows.

## Local verification record — 2026-09-05

Verified against the local working tree without committing or deploying:

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `docker compose config --quiet`: passed. The changed API checks/build ran freshly; unchanged workspaces used Turbo cache where available.
- `pnpm test`: passed, including 169 API tests (10 financial HTTP tests), 10 Driver tests, and 16 Passenger tests. SDK (9) and scanner (8) also passed during this verification session; their results were cached in the final root run. Several other workspaces currently have no unit tests.
- The initial uncached root run timed out in the existing MFA acceptance case while other checks were running. The isolated nine-test acceptance suite passed, and the final standard root test command also passed without competing checks. No test timeout or authentication behavior was changed.
- Two regression cases run against temporary copies of the original routes failed as expected: a drained-wallet payout retry and a full-refund retry both returned 422 instead of 201. Both cases passed against the updated routes. Temporary baseline files were removed.
- `pnpm recovery:validate` against the isolated test database passed with zero completed-ride allocation, wallet-balance, or excessive-refund violations. This was a reconciliation check, not a managed backup/restore drill.
- Existing large frontend bundle warnings and Turbo output-path warnings remain. Production providers, deployments, and real customer data were not used.
