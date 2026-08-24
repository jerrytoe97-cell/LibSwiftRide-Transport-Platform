import { describe, expect, it } from "vitest";
import { canReplaceKycDocument, driverReadiness, missingKycDocumentTypes, requiredKycDocumentTypes } from "./driver-onboarding.js";

describe("driver onboarding policy", () => {
  const ready = { verifiedAt: new Date(), onboardingStep: "COMPLETE", residentialAddress: "Paynesville", dateOfBirth: new Date("1990-01-01"), kycCase: { status: "APPROVED" }, vehicle: { active: true, make: "Toyota", model: "Corolla", color: "Blue", plateNumber: "T-123", category: "SEDAN" } };
  it("requires complete profile, approved KYC and active complete vehicle", () => {
    expect(driverReadiness(ready).ready).toBe(true);
    expect(driverReadiness({ ...ready, verifiedAt: null }).ready).toBe(false);
    expect(driverReadiness({ ...ready, vehicle: { ...ready.vehicle, category: "" } }).ready).toBe(false);
    expect(driverReadiness({ ...ready, residentialAddress: "" }).ready).toBe(false);
  });
  it("requires every mandatory clean document", () => {
    const documents = requiredKycDocumentTypes.slice(0, -1).map((type) => ({ type, scanStatus: "CLEAN" }));
    expect(missingKycDocumentTypes(documents)).toEqual(["PROFILE_PHOTO"]);
    expect(missingKycDocumentTypes([...documents, { type: "PROFILE_PHOTO", scanStatus: "INFECTED" }])).toEqual(["PROFILE_PHOTO"]);
  });
  it("locks review and limits rejected resubmission to named documents", () => {
    expect(canReplaceKycDocument("DRAFT", "NATIONAL_ID")).toBe(true);
    expect(canReplaceKycDocument("SUBMITTED", "NATIONAL_ID")).toBe(false);
    expect(canReplaceKycDocument("REJECTED", "NATIONAL_ID", "DOCUMENTS:NATIONAL_ID,INSURANCE")).toBe(true);
    expect(canReplaceKycDocument("REJECTED", "DRIVER_LICENSE", "DOCUMENTS:NATIONAL_ID,INSURANCE")).toBe(false);
  });
});
