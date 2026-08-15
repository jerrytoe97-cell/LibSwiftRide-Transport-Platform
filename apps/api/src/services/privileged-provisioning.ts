import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth.js";
import { liberianPhoneLookupCandidates, normalizeLiberianPhone, strongPasswordSchema } from "./identity.js";

export const privilegedRoles = ["ADMIN", "DISPATCHER", "FLEET_MANAGER", "BUSINESS_MANAGER"] as const;

const accountSchema = z.object({
  phone: z.string().transform((value, context) => {
    try { return normalizeLiberianPhone(value); }
    catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid phone" }); return z.NEVER; }
  }),
  email: z.string().trim().email(),
  password: strongPasswordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(privilegedRoles),
  organisationName: z.string().trim().min(2).max(160).optional()
}).superRefine((account, context) => {
  if (["FLEET_MANAGER", "BUSINESS_MANAGER"].includes(account.role) && !account.organisationName) {
    context.addIssue({ code: "custom", path: ["organisationName"], message: "Organisation name is required for fleet and business managers" });
  }
});

export const privilegedAccountsSchema = z.array(accountSchema).min(1).max(12).superRefine((accounts, context) => {
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const [index, account] of accounts.entries()) {
    const email = account.email.toLowerCase();
    if (phones.has(account.phone)) context.addIssue({ code: "custom", path: [index, "phone"], message: "Phone must be unique in the provisioning batch" });
    if (emails.has(email)) context.addIssue({ code: "custom", path: [index, "email"], message: "Email must be unique in the provisioning batch" });
    phones.add(account.phone);
    emails.add(email);
  }
});

export type PrivilegedAccountInput = z.infer<typeof accountSchema>;

export function parsePrivilegedAccounts(raw: string): PrivilegedAccountInput[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("PRIVILEGED_ACCOUNTS_JSON must contain valid JSON");
  }
  return privilegedAccountsSchema.parse(value).map((account) => ({ ...account, email: account.email.toLowerCase() }));
}

export const PRIVILEGED_PROVISIONING_CONFIRMATION = "PROVISION_STAGING_PRIVILEGED_ACCOUNTS";
// Each explicitly approved staging bootstrap gets a new permanent audit marker.
// v1 was consumed by the initial owner-account attempt; v2 is reserved for the
// separately identified Admin account approved on 2026-08-15.
export const STARTUP_PROVISIONING_MARKER = "privileged-staging-startup-v2";

type ProvisioningResult = { status: "provisioned"; count: number } | { status: "already-completed"; count: 0 };

export async function provisionPrivilegedAccounts(
  prisma: PrismaClient,
  rawAccounts: string,
  options: { singleUseMarker?: string } = {}
): Promise<ProvisioningResult> {
  const accounts = parsePrivilegedAccounts(rawAccounts);
  const preparedAccounts = await Promise.all(accounts.map(async (account) => ({ ...account, passwordHash: await hashPassword(account.password) })));

  return prisma.$transaction(async (tx) => {
    if (options.singleUseMarker) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1279742544)`;
      const completed = await tx.auditLog.findFirst({
        where: { action: "PRIVILEGED_STAGING_STARTUP_COMPLETED", entityType: "System", entityId: options.singleUseMarker },
        select: { id: true }
      });
      if (completed) return { status: "already-completed", count: 0 };
    }

    const existing = await tx.user.findMany({
      where: { OR: accounts.flatMap((account) => [...liberianPhoneLookupCandidates(account.phone).map((phone) => ({ phone })), { email: account.email }]) },
      select: { id: true }
    });
    if (existing.length) throw new Error("Provisioning stopped because one or more phone numbers or emails already exist; existing accounts are never overwritten");

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
      if (account.role === "FLEET_MANAGER") await tx.fleet.create({ data: { name: account.organisationName!, managerId: user.id } });
      if (account.role === "BUSINESS_MANAGER") {
        await tx.corporateAccount.create({ data: { name: account.organisationName!, billingEmail: account.email, managerId: user.id, monthlyBudgetMinor: 0 } });
      }
      await tx.auditLog.create({
        data: {
          action: "PRIVILEGED_STAGING_ACCOUNT_PROVISIONED",
          entityType: "User",
          entityId: user.id,
          metadata: { role: account.role, source: options.singleUseMarker ? "single-use-startup" : "one-time-provisioning" }
        }
      });
    }

    if (options.singleUseMarker) {
      await tx.auditLog.create({
        data: {
          action: "PRIVILEGED_STAGING_STARTUP_COMPLETED",
          entityType: "System",
          entityId: options.singleUseMarker,
          metadata: { accountCount: accounts.length }
        }
      });
    }
    return { status: "provisioned", count: accounts.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function consumeStartupProvisioningEnvironment(environment: NodeJS.ProcessEnv) {
  const confirmation = environment.PRIVILEGED_PROVISIONING_CONFIRM;
  const rawAccounts = environment.PRIVILEGED_ACCOUNTS_JSON;
  delete environment.PRIVILEGED_PROVISIONING_CONFIRM;
  delete environment.PRIVILEGED_ACCOUNTS_JSON;

  if (!confirmation && !rawAccounts) return null;
  if (confirmation !== PRIVILEGED_PROVISIONING_CONFIRMATION || !rawAccounts) {
    throw new Error("Privileged startup provisioning is incomplete or unauthorized");
  }
  return rawAccounts;
}
