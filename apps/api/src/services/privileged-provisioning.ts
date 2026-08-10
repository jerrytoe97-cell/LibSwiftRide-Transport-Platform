import { z } from "zod";

export const privilegedRoles = ["ADMIN", "DISPATCHER", "FLEET_MANAGER", "BUSINESS_MANAGER"] as const;

const strongPassword = z.string().min(16).max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol");

const accountSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email(),
  password: strongPassword,
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
