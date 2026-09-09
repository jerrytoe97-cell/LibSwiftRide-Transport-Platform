import type { KycDocumentType, Prisma } from "@prisma/client";
import { prisma } from "../lib.js";
import { lockIdentity } from "./verification-tokens.js";
import { SecurityOperationError } from "./security-operation.js";
import { requireActiveAdministrator } from "./active-administrator.js";

const required: KycDocumentType[] = ["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"];
async function lockedDriver(tx: Prisma.TransactionClient, userId: string) {
  await lockIdentity(tx, userId);
  const driver = await tx.driver.findUnique({ where: { userId }, include: { user: { select: { email: true, status: true, role: true } }, kycCase: { include: { documents: true } } } });
  if (!driver?.kycCase) throw new SecurityOperationError(422, "KYC_NOT_STARTED", "Complete driver onboarding first");
  if (driver.user.status !== "ACTIVE" || driver.user.role !== "DRIVER") throw new SecurityOperationError(409, "ACCOUNT_INACTIVE", "Driver account is not active");
  return driver;
}
function assertMutable(status: string) {
  if (!["DRAFT", "REJECTED"].includes(status)) throw new SecurityOperationError(409, "KYC_LOCKED", "Documents cannot be changed during or after review");
}
export async function completeKycDocument(input: { userId: string; caseId: string; type: KycDocumentType; storageKey: string; mimeType: string; sizeBytes: number; checksum: string; scannedAt: Date }) {
  return prisma.$transaction(async (tx) => {
    const driver = await lockedDriver(tx, input.userId);
    const kycCase = driver.kycCase!;
    if (kycCase.id !== input.caseId) throw new SecurityOperationError(403, "KYC_UPLOAD_FORBIDDEN", "Document belongs to a different case");
    assertMutable(kycCase.status);
    const previous = kycCase.documents.find((d) => d.type === input.type);
    const data = { storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, checksum: input.checksum, scannedAt: input.scannedAt, scanStatus: "CLEAN", verifiedAt: null, expiresAt: null };
    const document = await tx.kycDocument.upsert({ where: { kycCaseId_type: { kycCaseId: kycCase.id, type: input.type } }, update: data, create: { kycCaseId: kycCase.id, type: input.type, ...data } });
    await tx.auditLog.create({ data: { actorId: input.userId, action: "KYC_DOCUMENT_UPLOADED", entityType: "KycDocument", entityId: document.id, metadata: { caseId: kycCase.id, type: input.type, scanStatus: "CLEAN" } } });
    return { document, previous };
  });
}
export async function submitKyc(userId: string) {
  return prisma.$transaction(async (tx) => {
    const driver = await lockedDriver(tx, userId); const kycCase = driver.kycCase!;
    assertMutable(kycCase.status);
    if (required.some((type) => !kycCase.documents.some((d) => d.type === type && d.scanStatus === "CLEAN"))) throw new SecurityOperationError(422, "KYC_DOCUMENTS_REQUIRED", "All five required documents must pass scanning");
    const submitted = await tx.kycCase.update({ where: { id: kycCase.id }, data: { status: "SUBMITTED", submittedAt: new Date(), rejectionCode: null, rejectionNotes: null } });
    await tx.auditLog.create({ data: { actorId: userId, action: "KYC_SUBMITTED", entityType: "KycCase", entityId: kycCase.id } });
    return { submitted, email: driver.user.email };
  });
}
export async function reviewKyc(input: { caseId: string; actorId: string; decision: "APPROVED" | "REJECTED"; rejectionCode?: string | undefined; rejectionNotes?: string | undefined }) {
  const lookup = await prisma.kycCase.findUnique({ where: { id: input.caseId }, select: { driver: { select: { userId: true } } } });
  if (!lookup) throw new SecurityOperationError(409, "KYC_NOT_REVIEWABLE", "KYC case is not reviewable");
  return prisma.$transaction(async (tx) => {
    const driver = await lockedDriver(tx, lookup.driver.userId); const kycCase = driver.kycCase!;
    await requireActiveAdministrator(tx, input.actorId);
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(kycCase.status)) throw new SecurityOperationError(409, "KYC_NOT_REVIEWABLE", "KYC case is not reviewable");
    if (input.decision === "APPROVED" && required.some((type) => !kycCase.documents.some((d) => d.type === type && d.scanStatus === "CLEAN"))) throw new SecurityOperationError(422, "KYC_DOCUMENTS_NOT_CLEAN", "All required documents must pass scanning before approval");
    const result = await tx.kycCase.update({ where: { id: kycCase.id }, data: { status: input.decision, reviewerId: input.actorId, reviewedAt: new Date(), rejectionCode: input.rejectionCode ?? null, rejectionNotes: input.rejectionNotes ?? null } });
    await tx.driver.update({ where: { id: driver.id }, data: input.decision === "APPROVED" ? { verifiedAt: new Date(), approvedById: input.actorId, onboardingStep: "COMPLETE" } : { verifiedAt: null, onboardingStep: "DOCUMENTS", ...(driver.status === "AVAILABLE" ? { status: "OFFLINE" } : {}) } });
    await tx.kycDocument.updateMany({ where: { kycCaseId: kycCase.id }, data: { verifiedAt: input.decision === "APPROVED" ? new Date() : null } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: `KYC_${input.decision}`, entityType: "KycCase", entityId: kycCase.id } });
    return { result, userId: driver.userId, email: driver.user.email };
  });
}
