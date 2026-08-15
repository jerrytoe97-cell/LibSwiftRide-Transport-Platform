import { z } from "zod";

export const strongPasswordSchema = z.string().min(16).max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol");

export function normalizeLiberianPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(compact)) return `+231${compact.slice(1)}`;
  if (/^231\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+231\d{9}$/.test(compact)) return compact;
  throw new Error("Phone must be a valid Liberian number such as +231770000000 or 0770000000");
}

export function liberianPhoneLookupCandidates(value: string) {
  const canonical = normalizeLiberianPhone(value);
  return [canonical, `0${canonical.slice(4)}`];
}

export async function selectAuthenticatedIdentity<T extends { passwordHash: string; status: string }>(
  candidates: T[],
  password: string,
  verify: (hash: string, password: string) => Promise<boolean>
) {
  const verified = await Promise.all(candidates.map(async (candidate) =>
    candidate.status === "ACTIVE" && await verify(candidate.passwordHash, password)
  ));
  const matches = candidates.filter((_candidate, index) => verified[index]);
  return matches.length === 1 ? matches[0] : null;
}
