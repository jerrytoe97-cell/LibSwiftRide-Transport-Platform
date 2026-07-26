CREATE TYPE "UserRole" AS ENUM ('PASSENGER','DRIVER','FLEET_MANAGER','ADMIN','SUPPORT');
CREATE TYPE "UserStatus" AS ENUM ('PENDING','ACTIVE','SUSPENDED','DEACTIVATED');
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE','AVAILABLE','ON_TRIP','SUSPENDED');
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED','SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH','ORANGE_MONEY','MTN_MOMO','STRIPE','WALLET');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT','DEBIT','HOLD','RELEASE','PAYOUT','REFUND','ADJUSTMENT');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL','SMS','PUSH');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING','SENT','FAILED','READ');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY, "phone" TEXT NOT NULL UNIQUE, "email" TEXT UNIQUE,
  "passwordHash" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL, "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId","expiresAt");
CREATE TABLE "VerificationToken" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "VerificationToken_userId_type_expiresAt_idx" ON "VerificationToken"("userId","type","expiresAt");
CREATE TABLE "Fleet" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "managerId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Fleet_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id")
);
CREATE TABLE "Driver" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "fleetId" TEXT, "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
  "licenseNumber" TEXT NOT NULL UNIQUE, "nationalIdRef" TEXT, "onboardingStep" TEXT NOT NULL DEFAULT 'PROFILE',
  "approvedById" TEXT, "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),
  CONSTRAINT "Driver_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id")
);
CREATE TABLE "Vehicle" (
  "id" TEXT PRIMARY KEY, "fleetId" TEXT, "driverId" TEXT UNIQUE, "make" TEXT NOT NULL, "model" TEXT NOT NULL,
  "year" INTEGER NOT NULL, "color" TEXT NOT NULL, "plateNumber" TEXT NOT NULL UNIQUE, "active" BOOLEAN NOT NULL DEFAULT true,
  "inspectionExpiresAt" TIMESTAMP(3), "insuranceExpiresAt" TIMESTAMP(3), "registrationExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id"),
  CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
);
CREATE TABLE "PromoCode" (
  "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "percentageOff" INTEGER,
  "amountOffMinor" INTEGER, "maxDiscountMinor" INTEGER, "minimumFareMinor" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "maxUses" INTEGER,
  "uses" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Ride" (
  "id" TEXT PRIMARY KEY, "passengerId" TEXT NOT NULL, "driverId" TEXT, "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
  "pickupAddress" TEXT NOT NULL, "pickupLatitude" DECIMAL(9,6) NOT NULL, "pickupLongitude" DECIMAL(9,6) NOT NULL,
  "destinationAddress" TEXT NOT NULL, "destinationLatitude" DECIMAL(9,6) NOT NULL, "destinationLongitude" DECIMAL(9,6) NOT NULL,
  "estimatedDistanceM" INTEGER NOT NULL, "estimatedDurationSec" INTEGER NOT NULL, "fareMinor" INTEGER NOT NULL,
  "driverEarningsMinor" INTEGER NOT NULL, "companyCommissionMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'LRD',
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH', "promoCodeId" TEXT, "discountMinor" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  CONSTRAINT "Ride_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id"),
  CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id"),
  CONSTRAINT "Ride_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id"),
  CONSTRAINT "Ride_nonnegative_money" CHECK ("fareMinor">=0 AND "driverEarningsMinor">=0 AND "companyCommissionMinor">=0 AND "discountMinor">=0),
  CONSTRAINT "Ride_split_balances" CHECK ("driverEarningsMinor"+"companyCommissionMinor"="fareMinor")
);
CREATE UNIQUE INDEX "Ride_passengerId_idempotencyKey_key" ON "Ride"("passengerId","idempotencyKey");
CREATE INDEX "Ride_status_requestedAt_idx" ON "Ride"("status","requestedAt");
CREATE INDEX "Ride_driverId_status_idx" ON "Ride"("driverId","status");
CREATE TABLE "RideEvent" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "type" TEXT NOT NULL, "actorId" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RideEvent_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE
);
CREATE INDEX "RideEvent_rideId_createdAt_idx" ON "RideEvent"("rideId","createdAt");
CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL UNIQUE, "provider" TEXT NOT NULL, "providerRef" TEXT UNIQUE,
  "idempotencyKey" TEXT NOT NULL UNIQUE, "amountMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'LRD',
  "method" "PaymentMethod" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING', "providerPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id"),
  CONSTRAINT "Payment_nonnegative_amount" CHECK ("amountMinor">=0)
);
CREATE TABLE "Wallet" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "currency" TEXT NOT NULL DEFAULT 'LRD',
  "balanceMinor" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE TABLE "WalletTransaction" (
  "id" TEXT PRIMARY KEY, "walletId" TEXT NOT NULL, "type" "WalletTransactionType" NOT NULL,
  "amountMinor" INTEGER NOT NULL, "balanceMinor" INTEGER NOT NULL, "reference" TEXT NOT NULL UNIQUE,
  "idempotencyKey" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
);
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId","createdAt");
CREATE TABLE "Rating" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
  "score" INTEGER NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rating_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id"),
  CONSTRAINT "Rating_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id"),
  CONSTRAINT "Rating_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id"),
  CONSTRAINT "Rating_score_range" CHECK ("score" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "Rating_rideId_authorId_key" ON "Rating"("rideId","authorId");
CREATE INDEX "Rating_subjectId_createdAt_idx" ON "Rating"("subjectId","createdAt");
CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING', "template" TEXT NOT NULL, "title" TEXT NOT NULL,
  "body" TEXT NOT NULL, "data" JSONB, "sentAt" TIMESTAMP(3), "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId","status","createdAt");
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT,
  "ipAddress" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType","entityId");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId","createdAt");
