# KYC production setup: AWS S3 and ClamAV

This runbook prepares the existing KYC workflow without enabling real-document processing. Keep `KYC_FICTIONAL_ONLY=true` until the privacy, retention, recovery, and independent security reviews in `docs/KYC.md` are complete. Never approve a driver through database edits or synthetic scan results.

## Architecture and trust boundary

The API signs a five-minute direct `PUT` into `kyc/quarantine/`. The API then verifies the S3 object metadata, declared length, file signature, and SHA-256 checksum before sending a one-minute signed `GET` URL to the authenticated HTTPS scanner. The scanner independently validates the host, size, MIME type, magic bytes, and checksum and scans the bytes with ClamAV. Only a checksum-bound `clean` response allows the API to copy the object to `kyc/clean/` and delete the quarantine source.

The scanner performs malware detection only. It does not establish document authenticity or identity. An authorized Admin must manually review all five required `scanStatus=CLEAN` documents: driver licence, vehicle registration, insurance, inspection, and profile photo. Existing API authorization and audit logging remain authoritative.

## AWS S3 bucket

Create a dedicated bucket in the approved AWS account and region. Do not reuse a public-assets bucket.

1. Enable all four S3 Block Public Access settings at both account and bucket level.
2. Set Object Ownership to `Bucket owner enforced`; ACLs must remain disabled.
3. Enable bucket versioning before accepting uploads.
4. Configure default encryption with SSE-S3 (`AES256`). The API also signs uploads with the `x-amz-server-side-encryption: AES256` requirement.
5. Add a bucket policy that denies requests when `aws:SecureTransport` is false. Do not add public principals.
6. Enable CloudTrail S3 data events for object reads and writes to the KYC bucket. Deliver trails to a separate protected log bucket with log-file validation. S3 server access logging may be enabled as an additional control, with logs stored outside the KYC bucket.
7. Configure AWS account and CloudTrail alerts for public-access changes, bucket-policy changes, versioning suspension, encryption changes, lifecycle changes, and unusual object access.
8. Configure object recovery and backups according to the approved retention policy. Test recovery with fictional objects before accepting real documents.

### CORS

Replace the example origin with the exact production Driver application origin. Do not use `*`.

```json
[
  {
    "AllowedOrigins": ["https://DRIVER-APP-ORIGIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "content-type",
      "x-amz-meta-fictional",
      "x-amz-meta-classification",
      "x-amz-server-side-encryption"
    ],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 300
  }
]
```

### Lifecycle

Use separate rules for quarantine and clean objects. A safe starting policy is:

- Abort incomplete multipart uploads after one day.
- Expire current `kyc/quarantine/` objects after one day. Normal processing deletes them immediately; this rule removes abandoned uploads.
- Retain noncurrent quarantine versions only for the short, approved incident-recovery window, then permanently delete them.
- Do not configure automatic deletion of `kyc/clean/` until legal/privacy owners approve the exact document-retention period and hold requirements.
- After approval, add current-version and noncurrent-version expiration for `kyc/clean/` matching that policy. Never silently substitute an arbitrary retention period.

Review lifecycle behavior with versioning: deleting a current object normally creates a delete marker, so noncurrent-version expiration must be explicitly designed and tested.

## Least-privilege IAM

Render does not supply an AWS workload identity by default. Create a dedicated IAM principal for only the API service and store its access-key values as protected Render environment variables. Prefer temporary workload credentials if the deployment platform later supports them.

The identity needs bucket-location/version checks and object access only under `kyc/*`. Replace both placeholders before attaching the policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadBucketConfiguration",
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:GetBucketVersioning"],
      "Resource": "arn:aws:s3:::KYC_BUCKET_NAME"
    },
    {
      "Sid": "ManageKycObjectsOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::KYC_BUCKET_NAME/kyc/*"
    }
  ]
}
```

Do not grant `s3:*`, bucket-policy administration, public-access-block administration, lifecycle administration, versioning administration, or access to unrelated prefixes. The existing server-side S3 copy uses `GetObject` on the quarantine source and `PutObject` on the clean destination. SSE-S3 requires no KMS permissions.

## ClamAV scanner service

The scanner is in `apps/kyc-scanner`. Its container runs `freshclam`, `clamd`, and the Node HTTPS-facing contract adapter. Render terminates TLS before the container. The service exposes:

- `GET /health/live`: Node process liveness.
- `GET /health/ready`: readiness only when `clamd` returns a clean INSTREAM verdict.
- `POST /v1/scan`: bearer-authenticated scanner contract.

The scanner rejects redirects and, in production, accepts only HTTPS signed URLs whose hostname appears in `KYC_SCANNER_ALLOWED_DOWNLOAD_HOSTS`. For an AWS virtual-hosted bucket, the value normally follows `BUCKET.s3.REGION.amazonaws.com`; confirm the actual hostname from a fictional signed URL before deployment. Supply a comma-separated list only when AWS legitimately emits more than one hostname.

Deploy `render.kyc-scanner.yaml` as a separate Render Blueprint/service. Use an always-on plan with at least 2 GiB RAM because current ClamAV databases approach 1 GiB resident memory while loading; a sleeping or memory-constrained scanner would cause scans to fail closed. The ClamAV database is refreshed at container startup. Readiness remains closed if ClamAV has no usable signature database. Monitor image rebuilds and signature age; redeploy regularly and alert on failed `freshclam` updates.

Never log the bearer token, signed download URL, checksum, document bytes, precise driver data, or ClamAV signature contents. The service responses intentionally contain only a generic error or the expected checksum-bound verdict.

## Render environment configuration

Configure the scanner first, test it with fictional files, and then configure the API. The same scanner token is stored independently as a protected secret on both services.

Scanner service:

- `KYC_SCANNER_TOKEN`
- `KYC_SCANNER_ALLOWED_DOWNLOAD_HOSTS`
- `KYC_SCANNER_MAX_BYTES=5242880`
- `KYC_SCANNER_DOWNLOAD_TIMEOUT_MS=8000`
- `CLAMD_HOST=127.0.0.1`
- `CLAMD_PORT=3310`
- `CLAMD_TIMEOUT_MS=8000`

API service:

- `KYC_STORAGE_PROVIDER=s3`
- `KYC_S3_ENDPOINT` unset for native AWS S3
- `KYC_S3_REGION`
- `KYC_S3_BUCKET`
- `KYC_S3_ACCESS_KEY_ID`
- `KYC_S3_SECRET_ACCESS_KEY`
- `KYC_S3_FORCE_PATH_STYLE=false`
- `KYC_S3_SERVER_SIDE_ENCRYPTION=AES256`
- `KYC_S3_KMS_KEY_ID` unset while using SSE-S3
- `KYC_SCANNER_PROVIDER=webhook`
- `KYC_SCANNER_URL` set to the scanner's public HTTPS `/v1/scan` endpoint
- `KYC_SCANNER_TOKEN` matching the scanner secret
- `KYC_SCANNER_TIMEOUT_MS=10000`
- `KYC_FICTIONAL_ONLY=true`
- `KYC_UPLOAD_MAX_BYTES=5242880`

Keep the scanner and API maximum byte values equal. Do not place secret values in Blueprint YAML, `.env.example`, screenshots, logs, issue trackers, or support messages.

## Staged validation and enablement

1. Deploy the scanner and confirm both health endpoints, including ClamAV readiness.
2. Configure the private bucket and IAM identity, then verify public access is blocked, TLS is enforced, versioning is enabled, encryption is AES256, and CloudTrail data events are arriving.
3. Configure the API while retaining `KYC_FICTIONAL_ONLY=true`.
4. Upload only synthetic JPEG, PNG, and PDF fixtures. Confirm malformed files, incorrect sizes, MIME mismatches, wrong checksums, redirects, unauthorized scanner requests, timeouts, and scanner outages all fail closed.
5. Upload the standard safe EICAR test file only in the isolated fictional test flow and confirm an `infected` verdict prevents clean-object persistence and KYC submission.
6. Confirm the five-document submission rule and manual Admin approval rule with fictional accounts and append-only audit events.
7. Complete the legal/privacy retention review, recovery exercise, bucket-control review, scanner assessment, and independent production security assessment.
8. Only after those approvals should an authorized operator separately consider changing `KYC_FICTIONAL_ONLY`; this preparation deliberately leaves it `true`.
