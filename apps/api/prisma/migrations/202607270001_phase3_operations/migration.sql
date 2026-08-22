ALTER TYPE "RideStatus" ADD VALUE IF NOT EXISTS 'PASSENGER_BOARDED' AFTER 'DRIVER_ARRIVED';
CREATE TYPE "SafetyIncidentStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED');
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING','PROCESSING','PAID','FAILED','CANCELLED');

ALTER TABLE "Ride"
  ADD COLUMN "baseFareMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dynamicMultiplierBps" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "waitingTimeSec" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "waitingFeeMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tollMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "boardedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "capturedAt" TIMESTAMP(3);

CREATE TABLE "RoutePoint" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL, "heading" INTEGER, "speedMps" DECIMAL(7,2),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoutePoint_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE
);
CREATE INDEX "RoutePoint_rideId_recordedAt_idx" ON "RoutePoint"("rideId","recordedAt");

CREATE TABLE "EmergencyContact" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT NOT NULL,
  "relationship" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "EmergencyContact_userId_idx" ON "EmergencyContact"("userId");

CREATE TABLE "TripShare" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripShare_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE,
  CONSTRAINT "TripShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TripShare_tokenHash_key" ON "TripShare"("tokenHash");
CREATE INDEX "TripShare_rideId_expiresAt_idx" ON "TripShare"("rideId","expiresAt");

CREATE TABLE "SafetyIncident" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "reporterId" TEXT NOT NULL,
  "status" "SafetyIncidentStatus" NOT NULL DEFAULT 'OPEN', "category" TEXT NOT NULL, "note" TEXT,
  "latitude" DECIMAL(9,6), "longitude" DECIMAL(9,6), "acknowledgedBy" TEXT, "acknowledgedAt" TIMESTAMP(3),
  "resolvedBy" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SafetyIncident_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id")
);
CREATE INDEX "SafetyIncident_status_createdAt_idx" ON "SafetyIncident"("status","createdAt");
CREATE INDEX "SafetyIncident_rideId_createdAt_idx" ON "SafetyIncident"("rideId","createdAt");

CREATE TABLE "Refund" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "paymentId" TEXT, "amountMinor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL, "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED', "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT, "providerRef" TEXT, "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id"),
  CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id"),
  CONSTRAINT "Refund_positive_amount" CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status","createdAt");
CREATE INDEX "Refund_rideId_createdAt_idx" ON "Refund"("rideId","createdAt");

CREATE TABLE "DriverPayout" (
  "id" TEXT PRIMARY KEY, "driverId" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'LRD',
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING', "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "providerRef" TEXT, "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverPayout_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id"),
  CONSTRAINT "DriverPayout_positive_amount" CHECK ("amountMinor" > 0),
  CONSTRAINT "DriverPayout_valid_period" CHECK ("periodEnd" > "periodStart")
);
CREATE UNIQUE INDEX "DriverPayout_idempotencyKey_key" ON "DriverPayout"("idempotencyKey");
CREATE INDEX "DriverPayout_driverId_createdAt_idx" ON "DriverPayout"("driverId","createdAt");
CREATE INDEX "DriverPayout_status_createdAt_idx" ON "DriverPayout"("status","createdAt");
