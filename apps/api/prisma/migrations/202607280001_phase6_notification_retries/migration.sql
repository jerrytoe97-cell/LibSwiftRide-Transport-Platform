ALTER TABLE "Notification"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_attemptCount_valid" CHECK ("attemptCount" BETWEEN 0 AND 5);

CREATE INDEX "Notification_status_nextAttemptAt_idx"
  ON "Notification"("status", "nextAttemptAt");
