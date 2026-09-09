import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { completeKycDocument, reviewKyc, submitKyc } from "./services/kyc-operations.js";
import { lockIdentity } from "./services/verification-tokens.js";
afterAll(() => prisma.$disconnect());
async function fixture() {
  const user = await prisma.user.create({ data: { phone: `fictional-kyc-${randomUUID()}`, firstName: "Fictional", lastName: "Kyc", passwordHash: "unusable-test", role: "DRIVER", status: "ACTIVE", driver: { create: { licenseNumber: randomUUID(), kycCase: { create: {} } } } }, include: { driver: { include: { kycCase: true } } } });
  const admin = await prisma.user.create({ data: { phone: `fictional-reviewer-${randomUUID()}`, firstName: "Fictional", lastName: "Reviewer", passwordHash: "unusable-test", role: "ADMIN", status: "ACTIVE" } });
  const caseId = user.driver!.kycCase!.id;
  for (const type of ["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"] as const) await completeKycDocument({ userId: user.id, caseId, type, storageKey: `kyc/clean/${randomUUID()}`, checksum: "a".repeat(64), sizeBytes: 4, mimeType: "image/jpeg", scannedAt: new Date() });
  return { user, admin, caseId };
}
describe("PostgreSQL KYC concurrency", () => {
  it("rejects an administrator suspended after the initial request check", async () => {
    const { user, admin, caseId } = await fixture(); await submitKyc(user.id);
    await prisma.user.update({ where: { id: admin.id }, data: { status: "SUSPENDED" } });
    await expect(reviewKyc({ caseId, actorId: admin.id, decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.kycCase.findUniqueOrThrow({ where: { id: caseId } })).status).toBe("SUBMITTED");
    expect(await prisma.auditLog.count({ where: { entityId: caseId, action: "KYC_APPROVED" } })).toBe(0);
  });
  it("allows one final decision under simultaneous approval and rejection", async () => {
    const { user, admin, caseId } = await fixture(); await submitKyc(user.id);
    const results = await Promise.allSettled([reviewKyc({ caseId, actorId: admin.id, decision: "APPROVED" }), reviewKyc({ caseId, actorId: admin.id, decision: "REJECTED", rejectionCode: "TEST_REJECTION" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await prisma.kycCase.findUniqueOrThrow({ where: { id: caseId }, include: { driver: true } });
    expect(Boolean(current.driver.verifiedAt)).toBe(current.status === "APPROVED");
    expect(await prisma.auditLog.count({ where: { entityId: caseId, action: { in: ["KYC_APPROVED", "KYC_REJECTED"] } } })).toBe(1);
  });
  it("cannot replace an approved document using a scan completed before submission", async () => {
    const { user, admin, caseId } = await fixture(); await submitKyc(user.id);
    const before = await prisma.kycDocument.findUniqueOrThrow({ where: { kycCaseId_type: { kycCaseId: caseId, type: "DRIVER_LICENSE" } } });
    const results = await Promise.allSettled([reviewKyc({ caseId, actorId: admin.id, decision: "APPROVED" }), completeKycDocument({ userId: user.id, caseId, type: "DRIVER_LICENSE", storageKey: `kyc/clean/${randomUUID()}`, checksum: "b".repeat(64), sizeBytes: 4, mimeType: "image/jpeg", scannedAt: new Date() })]);
    expect(results[0]!.status).toBe("fulfilled"); expect(results[1]!.status).toBe("rejected");
    expect((await prisma.kycDocument.findUniqueOrThrow({ where: { id: before.id } })).storageKey).toBe(before.storageKey);
  });
  it("rechecks account status after waiting on the identity lock", async () => {
    const { user, admin, caseId } = await fixture(); await submitKyc(user.id);
    let release!: () => void; let locked!: () => void;
    const barrier = new Promise<void>((resolve) => { locked = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const suspension = prisma.$transaction(async (tx) => { await lockIdentity(tx, user.id); locked(); await gate; await tx.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } }); });
    await barrier;
    const review = reviewKyc({ caseId, actorId: admin.id, decision: "APPROVED" }); release();
    await suspension;
    await expect(review).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
    expect((await prisma.kycCase.findUniqueOrThrow({ where: { id: caseId } })).status).toBe("SUBMITTED");
  });
});
