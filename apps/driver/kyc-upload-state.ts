export type KycUploadStatus = "selected" | "uploading" | "success" | "error";

export type KycUploadState = {
  fileName: string;
  sizeBytes: number;
  status: KycUploadStatus;
  error?: string;
};

export function selectKycFile(file: Pick<File, "name" | "size">): KycUploadState {
  return { fileName: file.name, sizeBytes: file.size, status: "selected" };
}

export function markKycUploadRunning(state: KycUploadState): KycUploadState {
  return { fileName: state.fileName, sizeBytes: state.sizeBytes, status: "uploading" };
}

export function markKycUploadSuccessful(state: KycUploadState): KycUploadState {
  return { fileName: state.fileName, sizeBytes: state.sizeBytes, status: "success" };
}

export function markKycUploadFailed(state: KycUploadState, error: string): KycUploadState {
  return { fileName: state.fileName, sizeBytes: state.sizeBytes, status: "error", error };
}

export function formatKycFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function shouldResetKycFileInput(state: KycUploadState) {
  return state.status === "error";
}
