CREATE TABLE "ManualPaymentConfirmation" (
  "id" TEXT PRIMARY KEY,
  "paymentId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "confirmedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualPaymentConfirmation_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
);

CREATE UNIQUE INDEX "ManualPaymentConfirmation_paymentId_key"
  ON "ManualPaymentConfirmation"("paymentId");
CREATE UNIQUE INDEX "ManualPaymentConfirmation_idempotencyKey_key"
  ON "ManualPaymentConfirmation"("idempotencyKey");
