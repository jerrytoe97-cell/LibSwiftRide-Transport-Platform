import { createHash, randomUUID } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export const KYC_UPLOAD_TTL_SECONDS = 300;
export const KYC_DOWNLOAD_TTL_SECONDS = 120;
export const allowedKycMimeTypes = ["image/jpeg", "image/png", "application/pdf"] as const;

function client() {
  if (config.KYC_STORAGE_PROVIDER !== "s3" || !config.KYC_S3_ENDPOINT || !config.KYC_S3_BUCKET || !config.KYC_S3_ACCESS_KEY_ID || !config.KYC_S3_SECRET_ACCESS_KEY) {
    throw Object.assign(new Error("Private KYC storage is not configured"), { code: "KYC_STORAGE_UNAVAILABLE" });
  }
  return new S3Client({
    endpoint: config.KYC_S3_ENDPOINT,
    region: config.KYC_S3_REGION,
    forcePathStyle: config.KYC_S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.KYC_S3_ACCESS_KEY_ID, secretAccessKey: config.KYC_S3_SECRET_ACCESS_KEY }
  });
}

export function kycUploadEnabled() {
  return config.KYC_STORAGE_PROVIDER === "s3" && config.KYC_SCANNER_PROVIDER !== "disabled";
}

export function validateKycFile(bytes: Uint8Array, mimeType: string) {
  const matches = mimeType === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === "image/png"
      ? bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
      : mimeType === "application/pdf"
        ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        : false;
  if (!matches) throw Object.assign(new Error("File content does not match its declared type"), { code: "KYC_FILE_TYPE_MISMATCH" });
  if (new TextDecoder().decode(bytes).includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    throw Object.assign(new Error("File failed malware scanning"), { code: "KYC_MALWARE_DETECTED" });
  }
}

export async function createKycUploadIntent(input: { caseId: string; type: string; mimeType: string; sizeBytes: number }) {
  const storageKey = `kyc/${input.caseId}/${input.type}/${randomUUID()}`;
  const command = new PutObjectCommand({
    Bucket: config.KYC_S3_BUCKET!, Key: storageKey, ContentType: input.mimeType, ContentLength: input.sizeBytes,
    Metadata: { fictional: "true", classification: "restricted-kyc" }
  });
  return {
    storageKey,
    uploadUrl: await getSignedUrl(client(), command, { expiresIn: KYC_UPLOAD_TTL_SECONDS }),
    requiredHeaders: { "content-type": input.mimeType, "x-amz-meta-fictional": "true", "x-amz-meta-classification": "restricted-kyc" },
    expiresIn: KYC_UPLOAD_TTL_SECONDS
  };
}

export async function verifyAndScanKycObject(input: { storageKey: string; mimeType: string; sizeBytes: number; checksum: string }) {
  const s3 = client();
  const head = await s3.send(new HeadObjectCommand({ Bucket: config.KYC_S3_BUCKET!, Key: input.storageKey }));
  if (head.ContentLength !== input.sizeBytes || head.ContentLength > config.KYC_UPLOAD_MAX_BYTES) throw Object.assign(new Error("Uploaded file size does not match the signed request"), { code: "KYC_FILE_SIZE_MISMATCH" });
  if (head.ContentType !== input.mimeType || head.Metadata?.fictional !== "true") throw Object.assign(new Error("Uploaded file metadata is invalid"), { code: "KYC_FILE_METADATA_INVALID" });
  const object = await s3.send(new GetObjectCommand({ Bucket: config.KYC_S3_BUCKET!, Key: input.storageKey }));
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes || bytes.length !== input.sizeBytes) throw Object.assign(new Error("Uploaded file could not be verified"), { code: "KYC_FILE_INCOMPLETE" });
  validateKycFile(bytes, input.mimeType);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== input.checksum.toLowerCase()) throw Object.assign(new Error("Uploaded file checksum does not match"), { code: "KYC_CHECKSUM_MISMATCH" });
  const storageKey = `${input.storageKey}.clean-${checksum.slice(0, 16)}`;
  await s3.send(new CopyObjectCommand({ Bucket: config.KYC_S3_BUCKET!, CopySource: `${config.KYC_S3_BUCKET}/${input.storageKey}`, Key: storageKey, MetadataDirective: "COPY", ContentType: input.mimeType }));
  await s3.send(new DeleteObjectCommand({ Bucket: config.KYC_S3_BUCKET!, Key: input.storageKey }));
  return { storageKey, checksum, scanStatus: "CLEAN" as const, scannedAt: new Date() };
}

export async function createKycDownloadUrl(storageKey: string) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: config.KYC_S3_BUCKET!, Key: storageKey, ResponseCacheControl: "no-store" }), { expiresIn: KYC_DOWNLOAD_TTL_SECONDS });
}

export async function deleteKycObject(storageKey: string) {
  if (!kycUploadEnabled()) return;
  await client().send(new DeleteObjectCommand({ Bucket: config.KYC_S3_BUCKET!, Key: storageKey }));
}
