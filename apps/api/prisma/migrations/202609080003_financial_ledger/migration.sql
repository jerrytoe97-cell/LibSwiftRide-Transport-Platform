CREATE TABLE "LedgerJournal" (
  "id" TEXT PRIMARY KEY, "idempotencyKey" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL, "kind" TEXT NOT NULL, "reference" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "actorId" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postingTransaction" BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT "ledger_currency" CHECK ("currency" IN ('LRD', 'USD'))
);
CREATE INDEX "LedgerJournal_reference_createdAt_idx" ON "LedgerJournal"("reference", "createdAt");
CREATE TABLE "LedgerEntry" (
  "id" TEXT PRIMARY KEY, "journalId" TEXT NOT NULL REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "account" TEXT NOT NULL, "ownerKey" TEXT NOT NULL,
  "debitMinor" BIGINT NOT NULL DEFAULT 0, "creditMinor" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "ledger_entry_positive_one_side" CHECK (
    ("debitMinor" > 0 AND "creditMinor" = 0) OR ("creditMinor" > 0 AND "debitMinor" = 0)
  )
);
CREATE INDEX "LedgerEntry_ownerKey_account_idx" ON "LedgerEntry"("ownerKey", "account");
CREATE FUNCTION ledger_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial ledger records are append-only'; END;
$$;
CREATE TRIGGER ledger_journal_immutable BEFORE UPDATE OR DELETE ON "LedgerJournal" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE FUNCTION ledger_entry_open_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LedgerJournal" WHERE id = NEW."journalId" AND "postingTransaction" = txid_current()) THEN
    RAISE EXCEPTION 'Entries cannot be appended to a posted journal';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_open_journal BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_entry_open_journal();
CREATE FUNCTION ledger_balanced() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE journal_id TEXT; line_count BIGINT; net NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'LedgerJournal' THEN journal_id := NEW.id; ELSE journal_id := NEW."journalId"; END IF;
  SELECT COUNT(*), COALESCE(SUM("debitMinor"::NUMERIC - "creditMinor"::NUMERIC), 0)
    INTO line_count, net FROM "LedgerEntry" WHERE "journalId" = journal_id;
  IF line_count < 2 OR net <> 0 THEN RAISE EXCEPTION 'Ledger journal must contain balanced debit and credit entries'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "LedgerJournal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_balanced();
CREATE CONSTRAINT TRIGGER ledger_entry_balanced AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_balanced();
