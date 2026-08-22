CREATE TYPE "FavouritePlaceType" AS ENUM ('HOME','WORK','CUSTOM');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING','PUBLISHED','HIDDEN');

ALTER TABLE "Ride" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Rating" ADD COLUMN "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Rating" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "Rating" ADD COLUMN "moderatedById" TEXT;

CREATE TABLE "FavouritePlace" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" "FavouritePlaceType" NOT NULL,
  "label" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FavouritePlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "DriverAvailability" (
  "id" TEXT PRIMARY KEY,
  "driverId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverAvailability_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE,
  CONSTRAINT "DriverAvailability_valid_range" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "FavouritePlace_userId_label_key" ON "FavouritePlace"("userId","label");
CREATE INDEX "FavouritePlace_userId_type_idx" ON "FavouritePlace"("userId","type");
CREATE INDEX "DriverAvailability_driverId_startsAt_idx" ON "DriverAvailability"("driverId","startsAt");
CREATE INDEX "Ride_status_scheduledFor_idx" ON "Ride"("status","scheduledFor");
CREATE INDEX "Rating_status_createdAt_idx" ON "Rating"("status","createdAt");
