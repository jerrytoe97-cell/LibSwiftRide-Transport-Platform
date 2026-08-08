import { PrismaClient } from "@prisma/client";
import { recoveryReportPasses, validateRecoveredDatabase } from "./services/recovery-validation.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point to the isolated restored database");
const prisma = new PrismaClient();

try {
  const report = await validateRecoveredDatabase(prisma);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!recoveryReportPasses(report)) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
