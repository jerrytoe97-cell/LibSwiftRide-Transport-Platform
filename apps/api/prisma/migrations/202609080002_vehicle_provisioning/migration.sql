ALTER TABLE "Vehicle" ADD COLUMN "complianceVerifiedAt" TIMESTAMP(3), ADD COLUMN "complianceVerifiedById" TEXT;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_complianceVerifiedById_fkey" FOREIGN KEY ("complianceVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_compliance_attestation" CHECK (
  ("complianceVerifiedAt" IS NULL AND "complianceVerifiedById" IS NULL) OR
  ("complianceVerifiedAt" IS NOT NULL AND "complianceVerifiedById" IS NOT NULL AND "driverId" IS NOT NULL AND "insuranceExpiresAt" IS NOT NULL AND "inspectionExpiresAt" IS NOT NULL AND "registrationExpiresAt" IS NOT NULL)
);
-- Existing vehicles deliberately remain unattested. An administrator must review
-- the documents and provision them; no compliance dates are fabricated.
