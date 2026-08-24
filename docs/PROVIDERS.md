# Provider integration contracts

## Maps, routing and live GPS

The device operating system supplies GPS coordinates. Google Maps Platform provides production maps, places and road routing; it does not replace the authenticated LibSwiftRide location stream.

Set `VITE_MAP_PROVIDER=google` in production. The API uses `GOOGLE_MAPS_SERVER_API_KEY` only for Routes API calls and never returns it to clients. Browser applications use a separate `VITE_GOOGLE_MAPS_BROWSER_API_KEY` for Maps JavaScript API and Places API (New). Restrict the server key by API and by Render egress IP where practical; restrict the browser key to the seven exact HTTPS Render origins and only the required browser APIs. Never reuse keys across these trust boundaries. Without a browser key, the UI retains its non-production OpenStreetMap preview.

Google routing must use `ROUTING_PROVIDER=google` and the exact `ROUTING_API_URL=https://routes.googleapis.com/directions/v2:computeRoutes`. The API safely distinguishes invalid requests, authentication/restriction failures, quota exhaustion, provider failures, malformed replies, network failures, and genuine zero-route results. Provider logs include only the request correlation ID, provider/status classification, and a sanitized message; keys and authorization data are never logged.

Do not commit tokens. Configure account spending alerts and usage monitoring before staging. Production routing must use an approved server-side adapter with timeouts, retry limits and usage metrics; it must not silently fall back to the public OSRM demonstration endpoint. GPS authorization, trip-scoped WebSocket subscriptions and route-point retention remain enforced by LibSwiftRide regardless of the selected map provider.

## Payments

Orange Money Liberia, Lonestar Cell MTN Mobile Money and Stripe connect through the payment adapter. They are disabled by default. After official credentials and staging certification are supplied, configure the relevant endpoint and bearer token, set `PAYMENT_PROVIDER=mobile-money`, and explicitly set `PAYMENTS_ENABLED=true`. Requests include integer minor units, currency, phone where applicable, return URL and an idempotency key.

Provider hooks must return:

```json
{
  "providerRef": "provider-unique-reference",
  "status": "PENDING",
  "checkoutUrl": "https://provider.example/optional-checkout"
}
```

Callbacks sign the exact raw body with HMAC-SHA256 in `x-libswiftride-signature`. Replays are safe because provider references and payment idempotency keys are unique. Provider adapters reject disabled or unconfigured production calls. Cash remains available while external payments are disabled.

Provider certification must confirm Liberian currency behavior, phone-number normalization, refunds, reversals, timeouts, duplicate callbacks, cash reconciliation and settlement reports.

Recipient account numbers use `ORANGE_MONEY_NUMBER` and `MTN_MOMO_NUMBER`. They are protected runtime values. Only the passenger payment-display endpoint intentionally returns the selected provider's number; admin settings return configuration status and variable names rather than the values.

## Email, SMS and push

Delivery hooks accept authenticated POST requests containing notification ID, channel, destination, template, title, body and structured data. The notification ID is the provider idempotency key.

- Email destinations come from verified user email addresses.
- SMS destinations use normalized Liberian E.164 phone numbers.
- Push destinations come from active registered devices.

Production delivery hooks must suppress secrets in logs, sign callbacks, implement retry/backoff and expose delivery receipts. Failed database notification rows are visible to operations for replay.

### Password-reset email delivery

Production-equivalent deployments default to `NOTIFICATION_PROVIDER=sandbox`, which deliberately sends no external email. To use the existing authenticated webhook adapter, set `NOTIFICATION_PROVIDER=hooks`, `EMAIL_PROVIDER=hooks`, `EMAIL_DELIVERY_URL` and `EMAIL_DELIVERY_TOKEN` in the deployment secret manager.

The API retains its opt-in direct Resend HTTPS adapter. Set `NOTIFICATION_PROVIDER=hooks`, `EMAIL_PROVIDER=resend`, `EMAIL_FROM=support@libswiftride.com`, `EMAIL_REPLY_TO=support@libswiftride.com`, and `RESEND_API_KEY` to a restricted protected API key. The API sends branded HTML plus accessible plain text through `https://api.resend.com/emails` with bearer authentication and the notification ID as the idempotency key.

Production selects Zoho Mail SMTP so the verified `libswiftride.com` mailbox identity handles both sending and receiving. Set `NOTIFICATION_PROVIDER=hooks`, `EMAIL_PROVIDER=zoho`, `EMAIL_FROM=support@libswiftride.com`, `EMAIL_REPLY_TO=support@libswiftride.com`, `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `ZOHO_SMTP_SECURE`, `ZOHO_SMTP_USER`, and the protected `ZOHO_SMTP_APP_PASSWORD`. Port 465 uses implicit TLS (`ZOHO_SMTP_SECURE=true`); port 587 uses STARTTLS (`ZOHO_SMTP_SECURE=false`). Both modes require TLS 1.2 or newer, authenticated sending, and certificate validation. Use the exact SMTP host shown in the Zoho account because it can vary by account type or data center. The sender must be the authenticated mailbox or one of its configured aliases.

Keep `support@libswiftride.com` as the primary mailbox and sender/reply-to. Preserve `admin@libswiftride.com`, `info@libswiftride.com`, and `fleet@libswiftride.com` as Zoho aliases or mailboxes; the application does not need their credentials. Do not place provider credentials in source, frontend variables, logs, screenshots, or Render Blueprint values. Resend remains available as a rollback provider by changing `EMAIL_PROVIDER` back to `resend`; it has not been removed.

Before production activation, verify the domain, MX records, a single combined SPF record, DKIM, and DMARC in Zoho and the DNS provider. Generate a dedicated 12-digit Zoho app password for `support@libswiftride.com` when two-factor authentication is enabled, and enter it without spaces. Store it only as Render's secret `ZOHO_SMTP_APP_PASSWORD`. Provider activation, sending-limit approval, DNS propagation, and test-recipient evidence remain deployment-owner actions.

Customer-facing password, account-security, driver onboarding/KYC, booking and cancellation messages use the Support sender and Reply-To address. Operational aliases such as `dispatch@`, `fleet@`, `admin@`, and `info@libswiftride.com` remain available for staffed human correspondence; they are not application credentials and are not hard-coded as provider senders.

Password-reset requests remain enumeration-safe and return `202` whether an account exists, token creation succeeds, or queueing succeeds. A newly issued 64-character token invalidates earlier unused reset tokens; the verification table stores only its SHA-256 hash. The notification queue retains the delivery content only while required for retries and replaces it with a non-sensitive delivery marker after Resend accepts the message. The token expires after one hour and successful use revokes all refresh sessions. Notification bodies and provider requests must never be logged.
