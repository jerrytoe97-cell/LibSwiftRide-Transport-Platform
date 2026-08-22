-- Preserve historical 88/12 policy snapshots while allowing the new 86/14 policy.
ALTER TABLE "CommissionPolicy" DROP CONSTRAINT "CommissionPolicy_split_valid";
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_split_valid" CHECK (
  ("driverShareBps" = 8800 AND "companyCommissionBps" = 1200) OR
  ("driverShareBps" = 8600 AND "companyCommissionBps" = 1400)
);
