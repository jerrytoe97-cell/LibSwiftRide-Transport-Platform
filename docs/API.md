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
| POST | `/rides` with `scheduledFor` | Passenger scheduled booking, 15 minutes–30 days |
| GET | `/rides?limit=&cursor=&status=` | Passenger/driver history with cursor metadata |
| GET | `/rides/:id` | Ride participant, support or admin |
| GET | `/rides/:id/receipt` | Completed-ride participant, support or admin |
| GET | `/rides/:id/receipt.pdf` | Authorized PDF receipt download |
| GET | `/rides/:id/chat` | Assigned ride participant chat history |
| POST | `/rides/:id/transitions` | Role-bound acceptance, arrival, boarding, start, completion and cancellation |
| GET | `/rides/:id/tracking` | Participant/operations location and ETA |
| GET | `/rides/:id/route-replay` | Participant/operations route replay |
| POST | `/rides/:id/sos` | Active-ride participant safety alert |
| POST | `/rides/:id/share` | Participant expiring trip-share token |
| DELETE | `/rides/:rideId/shares/:id` | Trip-share owner revocation |
| GET | `/trip-shares/:token` | Token-authorized limited live trip view |
| GET/POST/DELETE | `/favourite-places` | Passenger-owned favourite places |
| POST | `/rides/:id/complete` | Assigned driver or admin |
| GET | `/drivers/me/earnings` | Driver |
| GET | `/drivers/me/dashboard` | Driver consolidated operations summary |
| GET/POST/DELETE | `/drivers/me/availability-schedule` | Driver-owned future availability windows |
| GET | `/referrals/me` | Authenticated referral code and rewards |
| PATCH | `/users/me/preferences` | Authenticated locale preference |
| POST/DELETE | `/devices` | Authenticated push-device lifecycle |
| POST | `/promos/validate` | Passenger promotion eligibility and bounded discount |
| GET | `/notifications?limit=&unreadOnly=` | Authenticated notification inbox and unread count |
| GET | `/dispatch/drivers` | Dispatcher/admin eligible available drivers |
| GET | `/payments/mobile-money/:method/display` | Passenger; intentionally returns only the selected payment number |
| POST | `/payments/webhooks/:provider` | Signed provider request |
| POST | `/rides/:id/refunds` | Admin/support idempotent refund request |
| PATCH | `/admin/refunds/:id` | Admin refund review |
| GET | `/drivers/me/payouts` | Driver payout history |
| POST | `/admin/drivers/:id/payouts` | Admin idempotent payout record |
| GET/POST/DELETE | `/safety/emergency-contacts` | User-owned emergency contacts |
| GET/PATCH | `/safety/incidents` | Operations safety queue |
| GET | `/admin/overview` | Admin |
| POST | `/admin/notifications` | Audited role/user in-app and push broadcast |
| GET | `/reports/analytics` | Admin/dispatcher operational and financial analytics |
| GET | `/admin/promos` | Admin promotion utilization |
| PATCH | `/admin/promos/:id` | Admin promotion lifecycle management |
| GET | `/admin/passengers` | Admin/support passenger search |
| PATCH | `/admin/passengers/:id/status` | Admin passenger lifecycle management |
| GET | `/admin/reviews` | Admin/support review queue |
| PATCH | `/admin/reviews/:id` | Admin review moderation |
| GET | `/auth/sessions` | Authenticated refresh-session list |
| DELETE | `/auth/sessions/:id` | Authenticated refresh-session revocation |
| GET | `/admin/settings/payments` | Admin; returns configuration status, never account numbers |

WebSocket endpoint `/ws` accepts the access token through an `auth.<base64url-token>` WebSocket subprotocol, keeping credentials out of URLs and proxy access logs. Driver locations bind to the verified token subject, and ride subscriptions require participant or operations access. Production should use very short-lived socket tickets when the client platform supports them and Redis pub/sub across replicas.

Subscribed ride participants may send `chat.send` events with `rideId` and `content`; the server emits persisted `chat.message` events. Messages are limited to 500 characters and one send per second per connection.

The `/openapi.json` endpoint is a placeholder document. Generate a complete contract from route schemas before public integration.
