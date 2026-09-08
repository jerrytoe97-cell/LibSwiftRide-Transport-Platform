# P0 implementation and verification plan

Target: `phase-2-development`, starting at `e0b1dfa`. Compare against audited local
main `75c13474b6bc1621227e314583df96dd2fb64211`. Preserve existing changes. No live
payments, deployments, pushes, or real-data fixtures are authorized by this plan.

## Existing work to retain

The branch already contains 86/14 pricing, 2% referral eligibility, role portals,
MFA, routing/geocoding, Zoho/Resend, private S3 KYC/scanner integration, provisioning,
ride offers, and financial/operational schemas. These supersede the main audit's
missing-feature findings but still require boundary and concurrency verification.

Uncommitted changes add cash-only booking/display gates, cash commission wallet
debits, refund/payout reservation integrity, idempotent refund adapter submission,
safety transitions/contact/escalation and dispatcher UI, native MTN sandbox-only
preparation, browser tests, package scripts/overrides and supporting documentation.
The nested passenger-production-fix worktree is separate work and must not be
staged into this repository. No existing changes will be reset or discarded.

## Ordered batches

1. **Authorization and sessions:** minimal response projections, fail-closed fleet
   scoping, current-role MFA, account/session validation, atomic refresh consumption
   and recovery token consumption; tests through HTTP and persistent boundaries.
2. **Driver/KYC safety:** immutable approved identity, conditional availability,
   shared eligible-driver policy, scanned document state consistency and audit.
3. **Financial integrity:** preserve 86/14, claim the one-time first-ride referral
   atomically and account for its platform funding; method-specific cash settlement;
   reserve financial requests without duplicate credits/debits; refuse production
   external payment enablement until provider certification is complete.
4. **Operational journeys:** durable searching-ride retry and offer expiry,
   assignment recovery, retained passenger/driver UI work and browser regressions.
5. **Deployment/verification:** strict production environment gates; run lint,
   typecheck, test, build and Compose validation; record database/provider/device
   evidence gaps and commit coherent reviewed batches without pushing.

## Acceptance gates

- No passwords, identity references or delivery secrets in participant responses.
- Old roles, suspended accounts, consumed refresh/recovery credentials cannot
  grant access; privileged roles require MFA on the current account.
- Only eligible drivers can become available or accept an assignment.
- Money stays in integer minor units; driver 86%, company gross 14%; the one-time
  2% referral is paid from company commission, never reducing driver earnings.
- Cash held by the driver creates company commission debt, not a second payout.
- Financial replay/concurrency cannot duplicate or over-reserve funds.
- Live external payments stay disabled. Mocked tests are not certification.
- Production approval requires real storage/concurrency, provider reconciliation,
  KYC scanner/storage, device, recovery, and deployed environment evidence.

## Initial verification limitation

Docker's engine pipe is unavailable. Do not run migrations against the protected
root `.env` database. Database tests must use a verified isolated test database.
Prior reports of successful runs are historical, not evidence for this increment.
