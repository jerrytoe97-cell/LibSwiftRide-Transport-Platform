ALTER TABLE "User"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredById" TEXT;
UPDATE "User" SET "referralCode" = "id" WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id");

CREATE TABLE "Referral" (
  "id" TEXT PRIMARY KEY, "referrerId" TEXT NOT NULL, "referredUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "rewardMinor" INTEGER NOT NULL DEFAULT 0,
  "qualifiedAt" TIMESTAMP(3), "rewardedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id"),
  CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id"),
  CONSTRAINT "Referral_reward_nonnegative" CHECK ("rewardMinor" >= 0),
  CONSTRAINT "Referral_not_self" CHECK ("referrerId" <> "referredUserId")
);
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId","status");

CREATE TABLE "ChatMessage" (
  "id" TEXT PRIMARY KEY, "rideId" TEXT NOT NULL, "senderId" TEXT NOT NULL, "content" TEXT NOT NULL,
  "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE,
  CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "ChatMessage_rideId_createdAt_idx" ON "ChatMessage"("rideId","createdAt");
CREATE INDEX "ChatMessage_senderId_createdAt_idx" ON "ChatMessage"("senderId","createdAt");

ALTER TABLE "KycDocument" ADD COLUMN "expiryReminderSentAt" TIMESTAMP(3);
CREATE INDEX "KycDocument_expiryReminderSentAt_expiresAt_idx" ON "KycDocument"("expiryReminderSentAt","expiresAt");
