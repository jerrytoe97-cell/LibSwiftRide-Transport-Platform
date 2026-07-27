ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUSINESS_MANAGER';
CREATE TYPE "ServiceType" AS ENUM ('RIDE','AIRPORT','CORPORATE');
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED');

ALTER TABLE "Ride" ADD COLUMN "serviceType" "ServiceType" NOT NULL DEFAULT 'RIDE',
  ADD COLUMN "corporateEmployeeId" TEXT, ADD COLUMN "ridePassId" TEXT;

CREATE TABLE "CorporateAccount" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"billingEmail" TEXT NOT NULL,"managerId" TEXT NOT NULL,"monthlyBudgetMinor" INTEGER NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "CorporateAccount_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id"),CONSTRAINT "CorporateAccount_budget_nonnegative" CHECK ("monthlyBudgetMinor">=0));
CREATE UNIQUE INDEX "CorporateAccount_managerId_key" ON "CorporateAccount"("managerId");
CREATE TABLE "CorporateEmployee" ("id" TEXT PRIMARY KEY,"accountId" TEXT NOT NULL,"userId" TEXT NOT NULL,"monthlyLimitMinor" INTEGER NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "CorporateEmployee_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CorporateAccount"("id") ON DELETE CASCADE,CONSTRAINT "CorporateEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),CONSTRAINT "CorporateEmployee_limit_nonnegative" CHECK ("monthlyLimitMinor">=0));
CREATE UNIQUE INDEX "CorporateEmployee_userId_key" ON "CorporateEmployee"("userId");
CREATE INDEX "CorporateEmployee_accountId_active_idx" ON "CorporateEmployee"("accountId","active");
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_corporateEmployeeId_fkey" FOREIGN KEY ("corporateEmployeeId") REFERENCES "CorporateEmployee"("id");
CREATE INDEX "Ride_corporateEmployeeId_requestedAt_idx" ON "Ride"("corporateEmployeeId","requestedAt" DESC);

CREATE TABLE "AirportPickup" ("id" TEXT PRIMARY KEY,"rideId" TEXT NOT NULL,"airportCode" TEXT NOT NULL,"flightNumber" TEXT NOT NULL,"terminal" TEXT,"arrivalAt" TIMESTAMP(3) NOT NULL,"meetAndGreet" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AirportPickup_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX "AirportPickup_rideId_key" ON "AirportPickup"("rideId");
CREATE INDEX "AirportPickup_airportCode_arrivalAt_idx" ON "AirportPickup"("airportCode","arrivalAt");

CREATE TABLE "IncentiveProgram" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"minimumRides" INTEGER NOT NULL,"bonusMinor" INTEGER NOT NULL,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"fleetId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "IncentiveProgram_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id"),CONSTRAINT "IncentiveProgram_values_positive" CHECK ("minimumRides">0 AND "bonusMinor">0),CONSTRAINT "IncentiveProgram_period_valid" CHECK ("endsAt">"startsAt"));
CREATE INDEX "IncentiveProgram_active_startsAt_endsAt_idx" ON "IncentiveProgram"("active","startsAt","endsAt");
CREATE TABLE "DriverIncentive" ("id" TEXT PRIMARY KEY,"programId" TEXT NOT NULL,"driverId" TEXT NOT NULL,"rideCount" INTEGER NOT NULL,"amountMinor" INTEGER NOT NULL,"awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "DriverIncentive_programId_fkey" FOREIGN KEY ("programId") REFERENCES "IncentiveProgram"("id"),CONSTRAINT "DriverIncentive_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id"));
CREATE UNIQUE INDEX "DriverIncentive_programId_driverId_key" ON "DriverIncentive"("programId","driverId");
CREATE INDEX "DriverIncentive_driverId_awardedAt_idx" ON "DriverIncentive"("driverId","awardedAt");

CREATE TABLE "CommissionPolicy" ("id" TEXT PRIMARY KEY,"driverShareBps" INTEGER NOT NULL,"companyCommissionBps" INTEGER NOT NULL,"effectiveAt" TIMESTAMP(3) NOT NULL,"createdById" TEXT NOT NULL,"reason" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "CommissionPolicy_split_valid" CHECK ("driverShareBps"=8800 AND "companyCommissionBps"=1200));
CREATE INDEX "CommissionPolicy_effectiveAt_idx" ON "CommissionPolicy"("effectiveAt" DESC);

CREATE TABLE "GeofenceZone" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"centerLatitude" DECIMAL(9,6) NOT NULL,"centerLongitude" DECIMAL(9,6) NOT NULL,"radiusM" INTEGER NOT NULL,"multiplierBps" INTEGER NOT NULL DEFAULT 10000,"airportCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "GeofenceZone_values_valid" CHECK ("radiusM">0 AND "multiplierBps" BETWEEN 10000 AND 30000));
CREATE INDEX "GeofenceZone_active_idx" ON "GeofenceZone"("active");

CREATE TABLE "Delivery" ("id" TEXT PRIMARY KEY,"customerId" TEXT NOT NULL,"driverId" TEXT,"status" "DeliveryStatus" NOT NULL DEFAULT 'REQUESTED',"pickupAddress" TEXT NOT NULL,"pickupLatitude" DECIMAL(9,6) NOT NULL,"pickupLongitude" DECIMAL(9,6) NOT NULL,"dropoffAddress" TEXT NOT NULL,"dropoffLatitude" DECIMAL(9,6) NOT NULL,"dropoffLongitude" DECIMAL(9,6) NOT NULL,"recipientName" TEXT NOT NULL,"recipientPhone" TEXT NOT NULL,"packageDescription" TEXT NOT NULL,"proofOfDeliveryRef" TEXT,"fareMinor" INTEGER NOT NULL,"driverEarningsMinor" INTEGER NOT NULL,"companyCommissionMinor" INTEGER NOT NULL,"idempotencyKey" TEXT NOT NULL,"requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id"),CONSTRAINT "Delivery_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id"),CONSTRAINT "Delivery_money_balanced" CHECK ("fareMinor">=0 AND "driverEarningsMinor">=0 AND "companyCommissionMinor">=0 AND "driverEarningsMinor"+"companyCommissionMinor"="fareMinor"));
CREATE UNIQUE INDEX "Delivery_customerId_idempotencyKey_key" ON "Delivery"("customerId","idempotencyKey");
CREATE INDEX "Delivery_status_requestedAt_idx" ON "Delivery"("status","requestedAt");
CREATE INDEX "Delivery_driverId_status_idx" ON "Delivery"("driverId","status");

CREATE TABLE "RidePassProduct" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"priceMinor" INTEGER NOT NULL,"rideCredits" INTEGER NOT NULL,"validityDays" INTEGER NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "RidePassProduct_values_positive" CHECK ("priceMinor">0 AND "rideCredits">0 AND "validityDays">0));
CREATE TABLE "RidePass" ("id" TEXT PRIMARY KEY,"productId" TEXT NOT NULL,"userId" TEXT NOT NULL,"ridesRemaining" INTEGER NOT NULL,"startsAt" TIMESTAMP(3) NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"status" TEXT NOT NULL DEFAULT 'ACTIVE',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RidePass_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RidePassProduct"("id"),CONSTRAINT "RidePass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),CONSTRAINT "RidePass_remaining_nonnegative" CHECK ("ridesRemaining">=0));
CREATE INDEX "RidePass_userId_status_expiresAt_idx" ON "RidePass"("userId","status","expiresAt");
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_ridePassId_fkey" FOREIGN KEY ("ridePassId") REFERENCES "RidePass"("id");

CREATE TABLE "CouponCampaign" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"budgetMinor" INTEGER NOT NULL,"spentMinor" INTEGER NOT NULL DEFAULT 0,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "CouponCampaign_budget_valid" CHECK ("budgetMinor">=0 AND "spentMinor">=0 AND "spentMinor"<="budgetMinor"),CONSTRAINT "CouponCampaign_period_valid" CHECK ("endsAt">"startsAt"));
CREATE INDEX "CouponCampaign_active_startsAt_endsAt_idx" ON "CouponCampaign"("active","startsAt","endsAt");
ALTER TABLE "PromoCode" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CouponCampaign"("id");

CREATE TABLE "FraudSignal" ("id" TEXT PRIMARY KEY,"userId" TEXT,"entityType" TEXT NOT NULL,"entityId" TEXT,"rule" TEXT NOT NULL,"score" INTEGER NOT NULL,"action" TEXT NOT NULL,"metadata" JSONB,"reviewedAt" TIMESTAMP(3),"reviewedById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "FraudSignal_score_valid" CHECK ("score" BETWEEN 0 AND 100));
CREATE INDEX "FraudSignal_userId_createdAt_idx" ON "FraudSignal"("userId","createdAt");
CREATE INDEX "FraudSignal_action_createdAt_idx" ON "FraudSignal"("action","createdAt");
