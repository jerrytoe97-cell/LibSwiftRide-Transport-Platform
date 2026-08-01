# Driver verification and KYC

Driver onboarding creates a KYC case. Drivers upload private object-storage references plus SHA-256 checksums; raw documents never pass through or reside in the application database.

Required submission documents are national ID, driver license and profile photo. Vehicle registration, insurance and inspection are required before vehicle approval and service activation.

The Driver portal provides JPEG/PNG capture, a 5 MB client-side limit, camera direction hints, and local previews for the public driver portrait and vehicle exterior photo. These previews never leave the device until private object storage, malware scanning, signed upload intents, retention rules, and authorized media delivery are configured. Do not repurpose KYC document references as public image URLs.

States:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED → SUBMITTED`

Only admins can approve or reject. Decisions record reviewer, timestamp and structured rejection code, and append an audit record. A driver can become available only when:

- KYC is approved
- `verifiedAt` is present
- an active vehicle is assigned
- no current trip is active

Document storage must use encryption, signed short-lived uploads/downloads, malware scanning, restricted reviewer access, retention policies and access auditing. Government IDs and storage keys must never appear in logs.
