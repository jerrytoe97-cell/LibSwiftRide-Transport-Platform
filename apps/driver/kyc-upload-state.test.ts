import { describe, expect, it } from "vitest";
import { formatKycFileSize, markKycUploadFailed, markKycUploadRunning, markKycUploadSuccessful, selectKycFile, shouldResetKycFileInput } from "./kyc-upload-state.js";

const file = { name: "fictional-driver-license.pdf", size: 1536 } as File;

describe("KYC upload UI state", () => {
  it("preserves the selected file name and size", () => {
    expect(selectKycFile(file)).toEqual({ fileName: file.name, sizeBytes: file.size, status: "selected" });
    expect(formatKycFileSize(file.size)).toBe("2 KB");
  });

  it("keeps the selected file visible while uploading and after a successful scan", () => {
    const uploading = markKycUploadRunning(selectKycFile(file));
    expect(uploading).toMatchObject({ fileName: file.name, sizeBytes: file.size, status: "uploading" });
    const successful = markKycUploadSuccessful(uploading);
    expect(successful).toEqual({ fileName: file.name, sizeBytes: file.size, status: "success" });
    expect(shouldResetKycFileInput(successful)).toBe(false);
  });

  it("shows the actual failure and permits selecting the same file again", () => {
    const failed = markKycUploadFailed(markKycUploadRunning(selectKycFile(file)), "Private storage rejected the upload.");
    expect(failed).toMatchObject({ fileName: file.name, status: "error", error: "Private storage rejected the upload." });
    expect(shouldResetKycFileInput(failed)).toBe(true);
    const retried = selectKycFile(file);
    expect(retried).toEqual({ fileName: file.name, sizeBytes: file.size, status: "selected" });
    expect(retried.error).toBeUndefined();
  });
});
