# Cash staging accounting

Electronic payments (including Orange Money, MTN/Lonestar Mobile Money and Stripe) remain disabled. Provider certification is deferred and is not a blocker for the current milestone: staging with fictional test data. These workflows record physical cash handovers; they do not initiate external transfers.

## Fare allocation

The API owns the calculation: company commission is 14%, rounded to integer minor units, and the driver receives the remainder (86%, subject to that minor-unit rounding). For a 1,000-minor-unit fare, the driver earns 860 and the company earns 140. A qualifying first-ride referral earns 20 from company expense, leaving company net income of 120 and driver earnings of 860. The passenger identity lock and conditional referral claim prevent duplicate first-ride rewards.

Cash collection by the driver clears the driver's 860 payable immediately. The remaining 140 becomes a company commission receivable from that driver. The wallet therefore decreases by 140; it does not receive an additional 860 that the driver has already retained in cash.

## Ledger invariants

`LedgerJournal` and `LedgerEntry` are created atomically with business state and wallet transactions. PostgreSQL requires positive integer entries on one side, at least two entries, and equal total debits and credits. Posted journals and entries cannot be updated or deleted, and later transactions cannot append entries to a posted journal. Corrections create additional journals.

Journal keys bind accounting details, actor and evidence. Serializable financial transactions retry PostgreSQL serialization/deadlock failures only after rollback. No provider calls occur inside these transactions.

The application allows five seconds to acquire an interactive transaction and ten seconds to complete its locked business, ledger and audit writes. Expiry still rolls back the entire operation. This is a production transaction budget; test deadlines and financial assertions are unchanged.

Accounts cover passenger payment clearing, driver cash clearing, provider clearing, driver/referrer payables, company commission, referral and incentive expense, cash commission receivables, payout reservations, company cash, refunds and adjustment clearing. Provider-clearing support is an internal accounting capability, not provider certification.

## Administrator workflows

All paths below are relative to `/api/v1`; require an active administrator and authenticated staff MFA. Monetary amounts are integer minor units. Evidence must identify a reviewed handover or correction record; never include payment credentials or government IDs.

| Endpoint | Request | Effect |
| --- | --- | --- |
| `POST /admin/drivers/:id/cash-collections` | `amountMinor`, `evidence`; `Idempotency-Key` header | Records cash received from the driver, reduces the receivable and updates the wallet once. Cannot exceed outstanding commission. |
| `POST /admin/drivers/:id/payouts` | `amountMinor`, `periodStart`, `periodEnd`; `Idempotency-Key` | Reserves only a reconciled available balance and transfers payable into a payout reservation. |
| `POST /admin/payouts/:id/cash-resolution` | `outcome`: `PAID` or `CANCELLED`, `evidence`; `Idempotency-Key` | Records a cash payout only against sufficient recorded company cash, or releases the reservation once. Terminal outcomes cannot be reopened. |
| `POST /rides/:id/refunds` | `amountMinor`, `reason`; `Idempotency-Key` | Administrator/support requests a refund within captured funds, including other reserved refunds. |
| `PATCH /admin/refunds/:id` | `status`: `APPROVED` or `REJECTED` | Administrator makes the final review decision. |
| `POST /admin/refunds/:id/cash-completion` | `evidence`; `Idempotency-Key` | Records cash returned **by the driver to the passenger** for a completed, ledger-backed cash ride. Reverses the company commission proportionally. |
| `POST /admin/drivers/:id/adjustments` | `deltaMinor`, `expectedBalanceMinor`, `evidence`; `Idempotency-Key` | Audited payable correction against a reconciled, unchanged reviewed balance. Debit adjustments cannot spend unavailable funds. |
| `POST /admin/adjustments/:id/reversal` | `evidence` | Reverses a manual adjustment once, keyed by the original journal. Preserves both postings and rejects insufficient recoverable funds. |
| `POST /admin/drivers/:id/reconciliation` | UUID `Idempotency-Key` | Records a replayable audit snapshot of wallet/ledger differences, missing settlements and mismatched payout reservations. Never changes balances. |

Partial-refund commission is computed cumulatively so splitting a refund cannot change total reversed commission. If commission has already been remitted, the refund creates a driver payable rather than a negative receivable. The first-ride referral expense remains company-funded; a refund does not requalify the passenger for another referral reward.

Historical wallets, settlements or payout reservations without ledger backing are blocked from payout or refund execution until an operator reviews and reconciles their provenance. Do not fabricate opening balances to clear this gate. The automated fixtures deliberately create balanced fictional opening entries.

## Vehicle and fleet provisioning

`POST /admin/drivers/:id/vehicle` accepts make, model, year, color, plate number, insurance/inspection/registration expiry dates and an evidence reference. Optional `vehicleId` selects an existing unassigned vehicle; optional `fleetId` scopes the assignment. The transaction requires active driver status, approved KYC and all five clean reviewed documents, locks the driver and vehicle, records the administrator and audit event, and leaves the driver offline for a fresh eligibility check.

`POST /fleet/drivers` is administrator-only and requires `fleetId`, `driverId` and `evidenceReference`. Fleet managers cannot claim arbitrary drivers. Enrollment clears vehicle attestation until the new assignment is reviewed. Removing a driver detaches the vehicle and clears its attestation in the same audited transaction.

## Isolated acceptance environment

Run `powershell -File infra/run-acceptance.ps1` from the repository. It starts `docker-compose.acceptance.yml`, applies migrations to the isolated test database and runs all API tests. It restores the process's previous database environment variables afterward. Services bind only to loopback on PostgreSQL port 15432 and Redis port 16379; their credentials are fictional and are not deployment credentials.

For the full workspace suite, set `TEST_DATABASE_URL=postgresql://test:acceptance-only-local@127.0.0.1:15432/libswiftride_test` and `TEST_REDIS_URL=redis://127.0.0.1:16379`, then run `pnpm test --force`. API test files run serially against the shared services; the concurrency tests still issue simultaneous refresh, review, assignment and financial requests.

On this 8 GB Windows workstation, Docker startup required a new user-level `.wslconfig` limiting WSL2 to 1 GB RAM, two processors and 1 GB swap. This host setting is outside the repository. It was created only after confirming no existing `.wslconfig` was present.
