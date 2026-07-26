# API guide

Base path: `/api/v1`. JSON responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?" } }`.

Authentication uses a short-lived bearer access token and a rotating refresh token. Production clients should store refresh tokens in secure, platform-appropriate storage. Privileged routes enforce server-side roles.

Implemented foundation endpoints:

| Method | Path | Role |
| --- | --- | --- |
| POST | `/auth/register` | Public, passenger/driver only |
| POST | `/auth/login` | Public |
| POST | `/rides/quote` | Authenticated |
| POST | `/rides` | Passenger; requires `Idempotency-Key` |
| GET | `/rides/:id` | Ride participant, support or admin |
| POST | `/rides/:id/complete` | Assigned driver or admin |
| GET | `/drivers/me/earnings` | Driver |
| POST | `/payments/webhooks/:provider` | Signed provider request |
| GET | `/admin/overview` | Admin |

WebSocket endpoint `/ws?access_token=...` accepts location events from authenticated drivers and binds stored updates to the token subject. Before production use, move credentials to a short-lived socket ticket or supported authorization header, validate update frequency and service bounds, and distribute events across API replicas.

The `/openapi.json` endpoint is a placeholder document. Generate a complete contract from route schemas before public integration.
