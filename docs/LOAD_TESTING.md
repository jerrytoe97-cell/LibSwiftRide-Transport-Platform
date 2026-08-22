# Staging load testing

The k6 scenario in `infra/load/api-readiness-and-quote.js` exercises dependency readiness and the authenticated, server-priced ride quote path. It is intentionally read-only: it does not create rides, payments, users or privileged events.

## Safety gate

The script refuses to start unless all of the following are true:

- `LOAD_TEST_ENVIRONMENT` is exactly `staging`.
- `LOAD_TEST_CONFIRM_TARGET` exactly matches `LOAD_TEST_BASE_URL`.
- An authenticated passenger token is supplied through `LOAD_TEST_ACCESS_TOKEN`.
- The target uses HTTPS, except when explicitly testing localhost.

Never place the token in source control, shell history, screenshots or captured output. Use a short-lived staging passenger token with no production data.

## Run

Install k6 from its official distribution, then run from the repository root. PowerShell example:

```powershell
$env:LOAD_TEST_ENVIRONMENT = "staging"
$env:LOAD_TEST_BASE_URL = "https://api-staging.example.com"
$env:LOAD_TEST_CONFIRM_TARGET = $env:LOAD_TEST_BASE_URL
$env:LOAD_TEST_ACCESS_TOKEN = "<short-lived-staging-passenger-token>"
k6 run infra/load/api-readiness-and-quote.js
Remove-Item Env:LOAD_TEST_ACCESS_TOKEN
```

The five-minute profile ramps quote traffic to 15 requests per second while probing readiness twice per second. The run fails if error rate reaches 1%, any iterations are dropped, readiness p95 exceeds 250 ms, or quote p95 exceeds 750 ms. These thresholds align with the monitoring alert boundary and are a staging admission test, not a production capacity claim.

## Evidence and interpretation

Record the immutable commit SHA, staging service size and replica count, database/Redis plans, routing-provider mode, test time in UTC, k6 version, summary output, and dashboard links. Do not capture tokens, request bodies, precise customer locations or provider credentials.

During the run, watch API CPU/memory, event-loop lag, PostgreSQL connections and slow queries, Redis latency/evictions, routing-provider latency and errors, and 429/5xx rates. A passing client summary is insufficient if a dependency saturates or recovers poorly.

Run once at the expected launch load and again at 2× that arrival rate after adjusting the checked-in scenario in a reviewed branch. Stop immediately for data-integrity errors, sustained readiness failure, database saturation, provider rate-limit breach or unexplained 5xx responses. Store sanitized evidence with the staging release record and leave the production gate closed until it is reviewed.
