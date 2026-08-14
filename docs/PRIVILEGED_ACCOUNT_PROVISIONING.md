# Privileged staging account provisioning

Admin, dispatcher, fleet-manager and business-manager accounts must never use public registration or the local demo seed. Provision them through the create-only command below while connected to the isolated staging database.

## Required controls

1. Obtain the account holder's approved staging phone, email, name and role through a restricted channel.
2. Generate a unique password of at least 16 characters containing upper/lowercase letters, a number and a symbol. Do not place it in source, chat, tickets, screenshots, shell history or deployment logs.
3. Set `PRIVILEGED_PROVISIONING_CONFIRM=PROVISION_STAGING_PRIVILEGED_ACCOUNTS` and `PRIVILEGED_ACCOUNTS_JSON` as temporary protected environment values on the API service. The JSON value is an array of account objects. Fleet and business managers also require `organisationName`.
4. Run `pnpm --filter @libswiftride/api provision:privileged` once from a restricted Render shell or one-off job.
5. The command creates accounts atomically, refuses to overwrite any existing phone/email, creates required fleet or corporate ownership records, appends an audit log, and never prints credentials.
6. Remove both temporary environment values immediately and restart the service if the hosting platform exposes environment changes to the runtime.
7. Deliver each initial password to its account holder through the approved secret manager, then use the password-reset flow to rotate it before broader staging access.
8. Verify each role can enter only its own portal and that failed cross-portal access signs the account out.

## Free Render single-use startup bootstrap

When the staging API plan does not provide Shell or One-Off Jobs, the API can execute the same create-only transaction once during startup. This does not expose an HTTP provisioning route.

1. Confirm the API service owns `https://libswiftride-transport-platform.onrender.com`, `PAYMENTS_ENABLED=false`, and `/health/ready` currently succeeds.
2. In the API service's protected Render environment, set `PRIVILEGED_PROVISIONING_CONFIRM` and `PRIVILEGED_ACCOUNTS_JSON` exactly as described above. Enter the password only in the protected JSON value.
3. Save the environment change and allow Render to redeploy the API. Before listening for HTTP traffic, the API consumes both variables, removes them from process memory, validates and hashes the password, obtains a PostgreSQL advisory lock, refuses existing phone/email records, creates the account and audit event atomically, and writes the permanent `privileged-staging-startup-v1` completion marker.
4. The log reports only the status and account count. It never reports account identity, password or credential JSON.
5. After `/health/ready` succeeds, immediately delete both temporary Render variables and save the environment. The database marker automatically disables this startup bootstrap even if a stale deployment briefly retains the variables. A later attempt cannot create another account through this bootstrap.
6. Sign in, enroll MFA, store recovery codes offline, then verify role isolation. The ordinary restricted-shell provisioning command remains available for future separately approved staff onboarding.

If only one variable is present, the confirmation is wrong, input validation fails, or an account already uses the phone/email, startup fails closed before accepting traffic. Correct or remove the temporary variables; never weaken the validator or edit the database manually.

Example structure with placeholders only:

```json
[
  {
    "phone": "<approved-staging-phone>",
    "email": "<approved-staging-email>",
    "password": "<secret-manager-value>",
    "firstName": "<first-name>",
    "lastName": "<last-name>",
    "role": "ADMIN"
  }
]
```

Allowed roles are `ADMIN`, `DISPATCHER`, `FLEET_MANAGER`, and `BUSINESS_MANAGER`. Never run the command against production until the production identity, access-approval and credential-delivery process has been formally approved.
