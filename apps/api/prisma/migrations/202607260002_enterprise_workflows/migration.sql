ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DISPATCHER';
CREATE TYPE "KycStatus" AS ENUM ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED');
CREATE TYPE "KycDocumentType" AS ENUM ('NATIONAL_ID','DRIVER_LICENSE','VEHICLE_REGISTRATION','INSURANCE','INSPECTION','PROFILE_PHOTO');

CREATE TABLE "Device" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "platform" TEXT NOT NULL, "pushToken" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Device_userId_active_idx" ON "Device"("userId","active");

CREATE TABLE "KycCase" (
  "id" TEXT PRIMARY KEY, "driverId" TEXT NOT NULL UNIQUE, "status" "KycStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "reviewerId" TEXT,
  "rejectionCode" TEXT, "rejectionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KycCase_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id"),
  CONSTRAINT "KycCase_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
);
CREATE INDEX "KycCase_status_submittedAt_idx" ON "KycCase"("status","submittedAt");

CREATE TABLE "KycDocument" (
  "id" TEXT PRIMARY KEY, "kycCaseId" TEXT NOT NULL, "type" "KycDocumentType" NOT NULL,
  "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "checksum" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycDocument_kycCaseId_fkey" FOREIGN KEY ("kycCaseId") REFERENCES "KycCase"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "KycDocument_kycCaseId_type_key" ON "KycDocument"("kycCaseId","type");
