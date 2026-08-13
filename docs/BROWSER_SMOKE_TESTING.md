# Browser smoke testing

The Playwright smoke suite checks the deployed public site and all six role portals in desktop Chromium and a mobile Chromium viewport. It uses synthetic credentials, intercepts login before it reaches the API, and must never use a real passenger, driver or staff account.

Run it after a staging deployment:

```bash
pnpm test:browser:install
pnpm test:browser:staging
```

On a workstation with Google Chrome already installed, set `PLAYWRIGHT_CHANNEL=chrome` to use it without downloading Playwright's bundled Chromium.

The suite verifies:

- API liveness and readiness return JSON with HTTP 200.
- Every portal returns a successful document and renders its main region.
- Public navigation targets one consistent Render deployment family.
- Each portal displays the correct role-specific authentication screen.
- Only Passenger and Driver expose public account registration.
- Login requests target the shared API origin, never a static frontend host.
- Offline transitions preserve the current passenger screen, clearly pause network-dependent actions and expose a connection retry control.

The default URLs are the Render staging services. Override any target with `STAGING_WEB_URL`, `STAGING_PASSENGER_URL`, `STAGING_DRIVER_URL`, `STAGING_FLEET_URL`, `STAGING_ADMIN_URL`, `STAGING_DISPATCHER_URL`, `STAGING_BUSINESS_URL` or `STAGING_API_URL`.

Each check retries twice because DNS resolution and cold starts can be transient on staging. A failure after all retries is evidence to investigate, not a reason to weaken an assertion.

Browser smoke coverage does not replace the authenticated role matrix or real-device GPS, permission, background-location and poor-network testing in `STAGING_CHECKLIST.md`.

## Hosted automation

`.github/workflows/staging-browser-smoke.yml` runs the complete desktop and mobile suite after a successful `CI` workflow on `phase-2-development`. It can also be started manually with `workflow_dispatch`.

The workflow checks out the test suite from the exact revision validated by the triggering CI run, allows the checks-gated Render rollout time to settle, has read-only repository permissions, cancels obsolete runs, and uploads Playwright reports, screenshots and traces for 14 days. It does not receive or submit user credentials.
