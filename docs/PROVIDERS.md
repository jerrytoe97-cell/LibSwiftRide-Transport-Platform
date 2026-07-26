# Provider integration contracts

## Payments

Orange Money Liberia, Lonestar Cell MTN Mobile Money and Stripe connect through the payment adapter. Configure the relevant endpoint and bearer token, then set `PAYMENT_PROVIDER=mobile-money`. Requests include integer minor units, currency, phone where applicable, return URL and an idempotency key.

Provider hooks must return:

```json
{
  "providerRef": "provider-unique-reference",
  "status": "PENDING",
  "checkoutUrl": "https://provider.example/optional-checkout"
}
```

Callbacks sign the exact raw body with HMAC-SHA256 in `x-libswiftride-signature`. Replays are safe because provider references and payment idempotency keys are unique. Provider adapters reject unconfigured production calls.

Provider certification must confirm Liberian currency behavior, phone-number normalization, refunds, reversals, timeouts, duplicate callbacks, cash reconciliation and settlement reports.

## Email, SMS and push

Delivery hooks accept authenticated POST requests containing notification ID, channel, destination, template, title, body and structured data. The notification ID is the provider idempotency key.

- Email destinations come from verified user email addresses.
- SMS destinations use normalized Liberian E.164 phone numbers.
- Push destinations come from active registered devices.

Production delivery hooks must suppress secrets in logs, sign callbacks, implement retry/backoff and expose delivery receipts. Failed database notification rows are visible to operations for replay.
