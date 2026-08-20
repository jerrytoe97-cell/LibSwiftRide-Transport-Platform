# Driver verification and private document storage

Driver onboarding creates a KYC case. The Driver portal requests a five-minute signed `PUT` URL and uploads directly to a private S3-compatible quarantine key. The API reads the object transiently for signature, metadata and SHA-256 verification, sends it through the configured malware scanner, copies a passing object to a separate immutable clean key, and deletes the quarantine key. Only the private clean storage key, MIME type, size, SHA-256 checksum and scan result are stored in PostgreSQL. Raw files must never be public, logged, emailed, committed, or stored in the database.

## Safety boundary

Staging accepts **fictional documents only**. `KYC_FICTIONAL_ONLY=true` is the default and the portal requires explicit confirmation. The `sandbox` scanner validates JPEG/PNG/PDF magic bytes, signed size/type metadata, SHA-256 integrity and the EICAR test signature. It is not approved for real identity documents; configuration validation refuses `KYC_SCANNER_PROVIDER=sandbox` when fictional-only mode is disabled.

Real uploads remain disabled until private storage and an authenticated production scanner are configured. Required documents are driver licence, vehicle registration, insurance, vehicle inspection/photo and profile photo. Every required document must have `scanStatus=CLEAN` before submission or approval.

## Provider configuration

Keep `KYC_STORAGE_PROVIDER=disabled` until an account owner provisions a dedicated private S3-compatible bucket. Configure values only in the protected deployment environment:

- `KYC_STORAGE_PROVIDER=s3`
- `KYC_S3_REGION` and `KYC_S3_BUCKET`
- `KYC_S3_ENDPOINT` for R2 or another compatible service; omit it for native AWS S3
- `KYC_S3_ACCESS_KEY_ID` and `KYC_S3_SECRET_ACCESS_KEY` together, or an AWS workload role where supported
- `KYC_S3_FORCE_PATH_STYLE` as required by the provider
- `KYC_S3_SERVER_SIDE_ENCRYPTION=provider` for provider-managed encryption (including R2), `AES256` for explicit AWS SSE-S3, or `aws:kms` with `KYC_S3_KMS_KEY_ID`
- `KYC_UPLOAD_MAX_BYTES=5242880`
- for fictional staging: `KYC_SCANNER_PROVIDER=sandbox` and `KYC_FICTIONAL_ONLY=true`
- for approved production scanning: `KYC_SCANNER_PROVIDER=webhook`, `KYC_SCANNER_URL`, `KYC_SCANNER_TOKEN`, `KYC_SCANNER_TIMEOUT_MS`, and `KYC_FICTIONAL_ONLY=false`

The bucket must block all public access, reject public ACLs/policies, enforce TLS and server-side encryption, enable versioning and access logs, and apply an approved retention/deletion lifecycle. CORS must allow `PUT` only from the exact Driver origin, allow `content-type`, `x-amz-meta-fictional`, and `x-amz-meta-classification`, and use a five-minute maximum age. Never use wildcard origins. Credentials must be bucket-scoped and limited to object read/write/delete under `kyc/`.

Quarantine objects live under `kyc/quarantine/`. Only scanner-approved objects are copied to checksum-derived names under `kyc/clean/`, after which the quarantine source is deleted.

## Production scanner contract

The scanner receives a one-minute signed, read-only quarantine URL plus the expected MIME type, size, and SHA-256 checksum over an authenticated HTTPS request. It must return `{"verdict":"clean|infected","checksum":"<same sha256>"}`. Any timeout, authentication failure, malformed response, mismatched checksum, or infected verdict fails closed and prevents persistence or approval. The signed URL and scanner token must never appear in logs.

## Review controls

States are `DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED | REJECTED -> SUBMITTED`. Only Admin accounts can review or obtain document access; Fleet and Dispatch accounts receive no document endpoint permission. Admin access uses an audited signed `GET` URL that expires after two minutes and returns `Cache-Control: no-store`. List responses omit storage keys and checksums.

Upload authorization, scan acceptance/rejection, upload completion, review start, decisions, and document access create append-only audit events without storage keys, checksums, URLs, or document contents. A driver can become available only after approval, `verifiedAt` is set, and an active vehicle is assigned.

Before accepting real documents, validate the approved scanner, complete privacy/legal and retention review, validate backup exclusions and object recovery, verify bucket policy/CORS/lifecycle controls, and complete an independent production security assessment.
