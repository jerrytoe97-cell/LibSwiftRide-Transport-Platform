# Backup and recovery strategy

## PostgreSQL

Production requires managed PostgreSQL with continuous WAL archiving and point-in-time recovery. Configure:

- Automated daily snapshots retained for 35 days
- Point-in-time recovery with a maximum 15-minute RPO
- Monthly encrypted archives retained for 12 months where legally permitted
- Cross-region or separate-account copies protected from application credentials
- Quarterly restore drills into an isolated environment

Backups must include Prisma migration history. Validate record counts, financial constraints, recent rides, wallets and audit logs after every restore drill. Never copy production identity or location data into development.

## Redis and documents

Redis location/presence data is disposable and must not be restored as current driver state. Notification/queue Redis deployments may use AOF, but PostgreSQL remains authoritative.

KYC files live in private encrypted object storage with versioning, malware scanning, checksums, lifecycle retention and access audit logs. Database backups contain only storage references and checksums.

## Recovery

Target RPO is 15 minutes and RTO is 60 minutes. A recovery incident requires:

1. Freeze writes or route traffic to maintenance mode.
2. Select and restore the latest verified recovery point.
3. Apply checked-in forward migrations.
4. Reconcile payments and wallet entries after the recovery point.
5. Invalidate all refresh sessions if credential exposure is possible.
6. Run booking/payment smoke tests before reopening traffic.
7. Document actual RPO/RTO and corrective actions.

Destructive restore operations require incident-commander and database-owner approval.

## Restore drill evidence

For each staging drill, record the source recovery point, target isolated database, operator, timestamps and checksums. Restore the provider-managed snapshot or PITR point, then run `pnpm db:deploy` against the isolated target. Compare counts and totals for `Ride`, `Payment`, `Refund`, `WalletTransaction`, `DriverPayout` and `AuditLog`; verify every completed ride has a balanced 88/12 allocation and that wallet transaction balances reconcile. Exercise `/health/ready` and a sandbox booking before declaring the restore usable. Never overwrite the source database during a drill.

Application rollback keeps additive Phase 5/6 tables and nullable columns in place. If a migration defect affects writes, disable traffic, restore the previous immutable application, and ship a reviewed forward corrective migration. Use PITR only when a forward correction cannot preserve integrity and the incident commander accepts reconciliation of provider events after the recovery point.
