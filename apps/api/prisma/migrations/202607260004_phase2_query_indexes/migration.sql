CREATE INDEX IF NOT EXISTS "Ride_passengerId_requestedAt_idx" ON "Ride"("passengerId", "requestedAt" DESC);
CREATE INDEX IF NOT EXISTS "Ride_driverId_completedAt_idx" ON "Ride"("driverId", "completedAt" DESC);
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromoCode_active_expiresAt_idx" ON "PromoCode"("active", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
