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
