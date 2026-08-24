CREATE TABLE "ProfilePhoto" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "bytes" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfilePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProfilePhoto_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 2097152),
  CONSTRAINT "ProfilePhoto_mime_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp'))
);
