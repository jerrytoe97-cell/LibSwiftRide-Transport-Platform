# Provider integration contracts

## Maps, routing and live GPS

The device operating system supplies GPS coordinates. Mapbox is an optional paid map, routing and navigation provider; it does not replace the authenticated LibSwiftRide location stream.

Mapbox remains opt-in. Set `VITE_MAP_PROVIDER=mapbox` only after billing approval and provide a dedicated public `pk.` token through `VITE_MAPBOX_ACCESS_TOKEN`. The UI refuses secret `sk.` tokens and otherwise keeps the OpenStreetMap preview. Use separate tokens for web, Android and iOS. Restrict the web token to approved HTTPS origins and least-privilege read scopes; native tokens cannot use web URL restrictions and must be isolated per mobile environment.

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

Alternatively, the API includes an opt-in direct Resend HTTPS adapter. Production transactional email remains on Resend; Zoho Mail is for human-operated business mailboxes and is not an SMTP dependency of the application. Set `NOTIFICATION_PROVIDER=hooks`, `EMAIL_PROVIDER=resend`, `EMAIL_FROM=support@libswiftride.com`, `EMAIL_REPLY_TO=support@libswiftride.com`, and `RESEND_API_KEY` to a restricted protected API key. The API sends branded HTML plus accessible plain text through `https://api.resend.com/emails` with bearer authentication and the notification ID as the idempotency key. Do not place provider keys in source, frontend variables, logs or screenshots. Provider activation, domain verification, pricing approval and test-recipient evidence remain deployment-owner actions.

Customer-facing password, account-security, driver onboarding/KYC, booking and cancellation messages use the Support sender and Reply-To address. Operational aliases such as `dispatch@`, `fleet@`, `admin@`, and `info@libswiftride.com` remain available for staffed human correspondence; they are not application credentials and are not hard-coded as provider senders.

Password-reset requests remain enumeration-safe and return `202` whether an account exists, token creation succeeds, or queueing succeeds. A newly issued 64-character token invalidates earlier unused reset tokens; the verification table stores only its SHA-256 hash. The notification queue retains the delivery content only while required for retries and replaces it with a non-sensitive delivery marker after Resend accepts the message. The token expires after one hour and successful use revokes all refresh sessions. Notification bodies and provider requests must never be logged.
