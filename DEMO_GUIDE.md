# LibSwiftRide local demonstration

This demonstration uses fictional people, trips and provider references. It is strictly local: payment APIs are disabled, notification delivery is sandboxed and demo authentication is rejected whenever `NODE_ENV=production`.

## Local applications

| Experience | URL | Demo role |
| --- | --- | --- |
| Public website | http://localhost:3000 | Public |
| Passenger app | http://localhost:3001 | Passenger |
| Driver app | http://localhost:3002 | Driver |
| Fleet portal | http://localhost:3003 | Fleet owner |
| Admin dashboard | http://localhost:3004 | Admin |
| Dispatcher console | http://localhost:3005 | Dispatcher |
| Business portal | http://localhost:3006 | Business account manager |
| API health | http://localhost:4000/health/ready | Public |
| API documentation | http://localhost:4000/openapi.json | Public |

Each role application shows an **Enter … demo** button when built or started with `VITE_DEMO_MODE=true`. The button requests a short-lived local JWT and stores it in browser session storage. No bearer-token copying is required.

## Demo accounts

All demo identities use reserved fictional phone patterns and `example.com` email addresses.

| Role | Phone | Password |
| --- | --- | --- |
| Passenger | `+231000000001` | `LibSwiftRide-Demo-2026!` |
| Driver | `+231000000002` | `LibSwiftRide-Demo-2026!` |
| Admin | `+231000000003` | `LibSwiftRide-Demo-2026!` |
| Dispatcher | `+231000000004` | `LibSwiftRide-Demo-2026!` |
| Fleet owner | `+231000000005` | `LibSwiftRide-Demo-2026!` |
| Business manager | `+231000000006` | `LibSwiftRide-Demo-2026!` |

The one-click flow is preferred. The password is provided for direct login API testing.

## Scripted end-to-end journey

1. Open the passenger app and select **Enter Passenger demo**.
2. Review saved places and ride history, then enter the sample pickup and destination.
3. Select a vehicle category and Cash, MTN MoMo or Orange Money. Live provider calls remain disabled.
4. Request a fare estimate, apply `WELCOME25`, then book.
5. Open the driver app in another browser profile and enter the driver demo.
6. Go online, inspect the incoming request and accept it.
7. Open the dispatcher console and enter the dispatcher demo. Confirm the ride appears on the map and timeline.
8. In the driver app, advance through arriving and arrived.
9. In the passenger app, confirm boarding using the demonstration ride flow.
10. Start the trip from the driver app and send location updates. Watch tracking and ETA update in the passenger and dispatcher views.
11. Test in-app chat, trip sharing and the SOS flow.
12. Complete the trip. Confirm the receipt shows 88% driver earnings and 12% LibSwiftRide commission.
13. Open the admin dashboard, enter the admin demo and review the manual Mobile Money record, verification evidence, platform analytics and audit trail.
14. Submit passenger-to-driver and driver-to-passenger ratings.
15. Explore fleet vehicle utilisation, compliance and payout summaries.
16. Explore business budgets, employees, policy controls, trip history and billing.

## Seed coverage

The guarded demo seed creates 25 passengers, 15 drivers, eight vehicles, three fleet owners, two business accounts, 20 employees and 48 rides across active, scheduled, completed and cancelled states. It also creates wallets, 88/12 fare allocations, manual Mobile Money confirmations, promotions, referrals, KYC records, document dates, support audit cases, safety incidents, ratings, notifications and ride chat messages.

Run the seed only with:

```bash
DEMO_MODE=true NODE_ENV=development pnpm --filter @libswiftride/api prisma:seed-demo
```

## Safety controls

- `PAYMENTS_ENABLED=false` is mandatory for this preview.
- `PAYMENT_PROVIDER=sandbox` and `NOTIFICATION_PROVIDER=sandbox` are used.
- Demo login returns `404` unless `DEMO_MODE=true`.
- Configuration validation rejects demo mode in production.
- All application ports should be bound to `127.0.0.1`.
- Never reuse demo passwords, identities or provider references outside local development.
