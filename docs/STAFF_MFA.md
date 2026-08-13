# Staff multi-factor authentication

LibSwiftRide requires authenticator-app MFA for `ADMIN`, `SUPPORT`, `DISPATCHER`, `FLEET_MANAGER`, and `BUSINESS_MANAGER` accounts. Passenger and driver authentication is unchanged.

## Sign-in and enrollment

1. Staff enter their phone number and password.
2. A first-time staff user receives a five-minute enrollment challenge instead of an application session.
3. The user adds the displayed `otpauth://` account (or manual secret) to an authenticator app, stores the eight recovery codes offline, and confirms a six-digit code.
4. Later password sign-ins require a current authenticator code or one unused recovery code.

Successful MFA creates access and refresh tokens marked with an MFA claim. Privileged tokens without that claim are rejected, including older refresh tokens. Completing enrollment revokes existing refresh sessions.

## Recovery codes

Recovery codes are one-use and stored only as SHA-256 hashes. Staff can replace the entire set from **Profile & security** after entering a current authenticator code. Replacing them invalidates every previous recovery code. New codes are returned once with `Cache-Control: no-store`.

If a staff member loses both their authenticator and all recovery codes, an authorized administrator must follow the controlled account-recovery process. Do not alter the database manually or send MFA secrets over chat or email.

## Configuration and operations

- Set `MFA_ENCRYPTION_KEY` to a dedicated high-entropy secret of at least 32 characters. It is required in production and must not be reused as a JWT or database credential.
- MFA secrets are encrypted with AES-256-GCM. The encryption key must live only in the deployment secret manager.
- Login/enrollment challenges expire after five minutes and are single-use after successful verification.
- MFA endpoints have a dedicated limit of 10 requests per 15 minutes per client in addition to the general authentication limit.
- Request logging redacts passwords, phones, payment numbers, MFA codes, challenge/enrollment tokens, refresh tokens, and authorization headers.
- Enrollment, enablement, sign-in, recovery-code sign-in, and recovery-code replacement emit audit events.

Do not rotate `MFA_ENCRYPTION_KEY` without a staged credential re-encryption plan. Losing the key makes existing authenticator secrets unreadable.
