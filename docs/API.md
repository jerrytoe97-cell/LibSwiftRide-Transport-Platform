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
| GET | `/rides?limit=&cursor=&status=` | Passenger/driver history with cursor metadata |
| GET | `/rides/:id` | Ride participant, support or admin |
| POST | `/rides/:id/complete` | Assigned driver or admin |
| GET | `/drivers/me/earnings` | Driver |
| GET | `/drivers/me/dashboard` | Driver consolidated operations summary |
| POST | `/promos/validate` | Passenger promotion eligibility and bounded discount |
| GET | `/notifications?limit=&unreadOnly=` | Authenticated notification inbox and unread count |
| GET | `/dispatch/drivers` | Dispatcher/admin eligible available drivers |
| GET | `/payments/mobile-money/:method/display` | Passenger; intentionally returns only the selected payment number |
| POST | `/payments/webhooks/:provider` | Signed provider request |
| GET | `/admin/overview` | Admin |
| GET | `/admin/promos` | Admin promotion utilization |
| GET | `/admin/settings/payments` | Admin; returns configuration status, never account numbers |

WebSocket endpoint `/ws` accepts the access token through an `auth.<base64url-token>` WebSocket subprotocol, keeping credentials out of URLs and proxy access logs. Driver locations bind to the verified token subject, and ride subscriptions require participant or operations access. Production should use very short-lived socket tickets when the client platform supports them and Redis pub/sub across replicas.

The `/openapi.json` endpoint is a placeholder document. Generate a complete contract from route schemas before public integration.
