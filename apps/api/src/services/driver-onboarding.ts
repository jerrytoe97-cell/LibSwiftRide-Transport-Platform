export const requiredKycDocumentTypes = ["DRIVER_LICENSE", "NATIONAL_ID", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "VEHICLE_PHOTOS", "PROFILE_PHOTO"] as const;
export type RequiredKycDocumentType = typeof requiredKycDocumentTypes[number];

export function cleanKycDocumentTypes(documents: Array<{ type: string; scanStatus: string }>) {
  return new Set(documents.filter((document) => document.scanStatus === "CLEAN").map((document) => document.type));
}

export function missingKycDocumentTypes(documents: Array<{ type: string; scanStatus: string }>) {
  const clean = cleanKycDocumentTypes(documents);
  return requiredKycDocumentTypes.filter((type) => !clean.has(type));
}

export function driverReadiness(driver: {
  verifiedAt?: Date | string | null;
  onboardingStep?: string | null;
  residentialAddress?: string | null;
  dateOfBirth?: Date | string | null;
  kycCase?: { status: string } | null;
  vehicle?: { active: boolean; make?: string; model?: string; color?: string; plateNumber?: string; category?: string } | null;
}) {
  const profileComplete = Boolean(driver.residentialAddress?.trim() && driver.dateOfBirth && driver.onboardingStep === "COMPLETE");
  const vehicleComplete = Boolean(driver.vehicle?.active && driver.vehicle.make?.trim() && driver.vehicle.model?.trim() && driver.vehicle.color?.trim() && driver.vehicle.plateNumber?.trim() && driver.vehicle.category?.trim());
  const ready = Boolean(driver.verifiedAt && driver.kycCase?.status === "APPROVED" && profileComplete && vehicleComplete);
  return { ready, profileComplete, vehicleComplete, verificationApproved: Boolean(driver.verifiedAt && driver.kycCase?.status === "APPROVED") };
}

export function rejectedDocumentTypes(rejectionCode?: string | null) {
  if (!rejectionCode?.startsWith("DOCUMENTS:")) return new Set<string>();
  return new Set(rejectionCode.slice("DOCUMENTS:".length).split(",").filter((type) => requiredKycDocumentTypes.includes(type as RequiredKycDocumentType)));
}

export function canReplaceKycDocument(caseStatus: string, type: string, rejectionCode?: string | null) {
  if (caseStatus === "DRAFT") return true;
  return caseStatus === "REJECTED" && rejectedDocumentTypes(rejectionCode).has(type);
}
