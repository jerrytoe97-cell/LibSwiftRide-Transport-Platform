# Mapbox activation checklist

Mapbox activation is a controlled production-readiness task, not a requirement for collecting GPS. No token or paid service is connected by this checklist.

## Account and cost controls

1. Approve the Mapbox account owner, billing method, monthly budget and incident contact.
2. Configure usage notifications and review current Maps, Directions and Navigation pricing before approving staging traffic.
3. Create separate public tokens for local web, staging web, production web, Android staging, Android production, iOS staging and iOS production.
4. Never use the default development token in production and never place an `sk.` secret token in a client build.

## Web activation

1. Give the web token only required read scopes such as styles and fonts.
2. Restrict it to the exact approved HTTPS web origins. Maintain a separate local-development token if local Mapbox rendering is required.
3. Set `VITE_MAP_PROVIDER=mapbox` and `VITE_MAPBOX_ACCESS_TOKEN=pk...` only in the environment secret/configuration system.
4. Update the deployed Content Security Policy to permit the documented Mapbox worker, image and connection sources while retaining `frame-ancestors 'self'`.
5. Verify attribution, map error handling, usage telemetry decisions and a usable no-map fallback.

## Native activation

1. Use distinct native public tokens. Do not apply web URL restrictions to native tokens.
2. Store configuration through the signed build system; do not expose account-management or secret scopes.
3. Test map rendering, navigation rerouting, poor-network behavior and token rotation on signed Android and iOS staging builds.
4. Confirm that ending a ride stops LibSwiftRide location transmission even if the native navigation screen remains open.

## Release evidence

Record token identifiers—not token values—build SHA, environment, device matrix, usage-alert screenshots, routing success/error rates and sign-off. Payments remain disabled throughout GPS and Mapbox certification.
