# Driver verification and private document storage

Driver onboarding creates a KYC case. The Driver portal requests a five-minute signed `PUT` URL and uploads directly to a private S3-compatible quarantine key. The API reads the object transiently for verification, copies a passing object to a separate clean key, and deletes the quarantine key so the still-live upload URL cannot overwrite reviewed content. Only the private clean storage key, MIME type, size, SHA-256 checksum and scan result are stored in PostgreSQL. Raw files must never be public, logged, emailed, committed, or stored in the database.

## Staging safety boundary

Staging accepts **fictional documents only**. `KYC_FICTIONAL_ONLY=true` is the default and the portal requires an explicit confirmation. The `sandbox` scanner validates JPEG/PNG/PDF magic bytes, signed size/type metadata, SHA-256 integrity and the EICAR test signature. It is not approved for real identity documents; configuration validation refuses `KYC_SCANNER_PROVIDER=sandbox` when fictional-only mode is disabled.

Required documents are driver licence, vehicle registration, insurance, vehicle inspection/photo and profile photo. All five must have `scanStatus=CLEAN` before submission or approval.

## Provider configuration

Keep `KYC_STORAGE_PROVIDER=disabled` until an account owner provisions a dedicated private S3-compatible bucket. Then enter these values only in the protected deployment environment:

- `KYC_STORAGE_PROVIDER=s3`
- `KYC_S3_ENDPOINT`, `KYC_S3_REGION`, `KYC_S3_BUCKET`
- `KYC_S3_ACCESS_KEY_ID`, `KYC_S3_SECRET_ACCESS_KEY`
- `KYC_S3_FORCE_PATH_STYLE` as required by the provider
- `KYC_SCANNER_PROVIDER=sandbox`, `KYC_FICTIONAL_ONLY=true` for fictional staging tests
- `KYC_UPLOAD_MAX_BYTES=5242880`

The bucket must block all public access, use encryption at rest, enable versioning/access logs, and apply an approved retention/deletion lifecycle. Its CORS policy should allow `PUT` only from the exact Driver staging origin, allow `content-type`, `x-amz-meta-fictional`, and `x-amz-meta-classification`, and use a five-minute maximum age. Do not allow wildcard origins. Credentials should be bucket-scoped and limited to object read/write/delete under the `kyc/` prefix.

## Review controls

States are `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED → SUBMITTED`. Only Admin accounts can review. The Admin portal obtains an audited signed `GET` URL that expires after two minutes and sends `Cache-Control: no-store`. API list responses deliberately omit storage keys and checksums. Decisions record reviewer, timestamp, structured rejection data and append-only audit events.

A driver can become available only after approval, `verifiedAt` is set, and an active vehicle is assigned. Before accepting real documents, replace sandbox scanning with an approved malware-scanning provider, complete privacy/legal and retention review, validate backup exclusions, and perform a production security assessment.
