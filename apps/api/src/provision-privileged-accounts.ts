import { PrismaClient } from "@prisma/client";
import { PRIVILEGED_PROVISIONING_CONFIRMATION, provisionPrivilegedAccounts } from "./services/privileged-provisioning.js";

if (process.env.PRIVILEGED_PROVISIONING_CONFIRM !== PRIVILEGED_PROVISIONING_CONFIRMATION) {
  throw new Error(`Set PRIVILEGED_PROVISIONING_CONFIRM=${PRIVILEGED_PROVISIONING_CONFIRMATION} for this one-time operation`);
}
if (!process.env.PRIVILEGED_ACCOUNTS_JSON) throw new Error("PRIVILEGED_ACCOUNTS_JSON is required");

const prisma = new PrismaClient();

try {
  const result = await provisionPrivilegedAccounts(prisma, process.env.PRIVILEGED_ACCOUNTS_JSON);
  process.stdout.write(`Provisioned ${result.count} privileged staging account(s). Credentials were not printed.\n`);
} finally {
  await prisma.$disconnect();
}
