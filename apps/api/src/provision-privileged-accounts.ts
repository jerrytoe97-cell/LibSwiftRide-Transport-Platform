import { PrismaClient } from "@prisma/client";
import { hashPassword } from "./auth.js";
import { parsePrivilegedAccounts } from "./services/privileged-provisioning.js";

const confirmation = "PROVISION_STAGING_PRIVILEGED_ACCOUNTS";
if (process.env.PRIVILEGED_PROVISIONING_CONFIRM !== confirmation) {
  throw new Error(`Set PRIVILEGED_PROVISIONING_CONFIRM=${confirmation} for this one-time operation`);
}
if (!process.env.PRIVILEGED_ACCOUNTS_JSON) throw new Error("PRIVILEGED_ACCOUNTS_JSON is required");

const accounts = parsePrivilegedAccounts(process.env.PRIVILEGED_ACCOUNTS_JSON);
const prisma = new PrismaClient();

try {
  const preparedAccounts = await Promise.all(accounts.map(async (account) => ({ ...account, passwordHash: await hashPassword(account.password) })));
  const existing = await prisma.user.findMany({
    where: { OR: accounts.flatMap((account) => [{ phone: account.phone }, { email: account.email }]) },
    select: { phone: true, email: true }
  });
  if (existing.length) throw new Error("Provisioning stopped because one or more phone numbers or emails already exist; existing accounts are never overwritten");

  await prisma.$transaction(async (tx) => {
    for (const account of preparedAccounts) {
      const user = await tx.user.create({
        data: {
          phone: account.phone,
          email: account.email,
          emailVerifiedAt: new Date(),
          passwordHash: account.passwordHash,
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
          status: "ACTIVE"
        }
      });
      if (account.role === "FLEET_MANAGER") {
        await tx.fleet.create({ data: { name: account.organisationName!, managerId: user.id } });
      }
      if (account.role === "BUSINESS_MANAGER") {
        await tx.corporateAccount.create({ data: { name: account.organisationName!, billingEmail: account.email, managerId: user.id, monthlyBudgetMinor: 0 } });
      }
      await tx.auditLog.create({
        data: {
          action: "PRIVILEGED_STAGING_ACCOUNT_PROVISIONED",
          entityType: "User",
          entityId: user.id,
          metadata: { role: account.role, source: "one-time-provisioning" }
        }
      });
    }
  });
  process.stdout.write(`Provisioned ${accounts.length} privileged staging account(s). Credentials were not printed.\n`);
} finally {
  await prisma.$disconnect();
}
