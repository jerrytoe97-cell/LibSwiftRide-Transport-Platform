# Passenger booking review

These changes are for review only. No deployment or production environment change is authorized by this patch.

## Approved initial Economy tariff

`apps/api/src/pricing-config.ts` is the single backend tariff definition: LRD 150 base, LRD 30/km, LRD 3/minute, LRD 250 minimum, default multiplier 1.0. Amounts remain integer minor units (100 = LRD 1). The calculation converts routing meters to km and seconds to minutes before applying these rates.

`max(250, (150 + 15.6 * 30 + 53 * 3) * 1) = LRD 777`. The previously reproduced 15.602 km / 53.4 minute trip now rounds to LRD 778 for a new booking. Final fares round to the nearest whole LRD, with halves rounded up. The displayed subtotal includes the rounding adjustment so subtotal minus discount equals the charged fare. Promo caps remain in minor units. Existing waiting-time grace/fees and tolls are preserved; the 86%/14% split is applied after final rounding.

`SURGE_PRICING_ENABLED` defaults to false. Demand and geofence multipliers are ignored unless deliberately enabled on the backend. Client requests cannot set a multiplier. When enabled, the existing supply/zone logic remains capped at 3x.

Previously booked rides retain the legacy tariff at completion using their persisted base-fare marker (LRD 200 vs the new LRD 150). Unknown markers fail closed for manual review. Before adding live Admin tariff editing, persist a tariff version/snapshot per ride and implement authorized, audited updates through `economyTariffSchema`; do not reuse the base-fare marker for arbitrary future versions. No Admin editor or database migration is included here.

The shared currency formatter displays whole fares as `LRD 777`, never `$777`; fractional wallet balances/commissions retain cents. No exchange rate is applied.

## Address lookup and routing activation

- Passenger address search and reverse lookup call authenticated, Passenger-authorized, rate-limited API endpoints. There is no geocoding token or direct provider request in Passenger source.
- Set backend `GEOCODING_API_TOKEN` securely and explicitly enable `GEOCODING_ENABLED=true` only after approving Mapbox permanent-geocoding entitlement/billing and validating Liberia coverage. Defaults keep the provider disabled. Neither value was configured in a real environment by this patch.
- Mapbox Geocoding v6 requests use `permanent=true` because ride and favourite-place results are stored. Temporary results must not be stored. See [Mapbox storage requirements](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results). No billing/account action has been taken.
- Existing `VITE_MAP_PROVIDER=mapbox`: opt-in map rendering, subject to the repository's Mapbox activation checklist. Do not create an account or enable billing without approval.
- Without backend provider activation, the existing curated Greater Monrovia landmarks and saved places remain available. Failed reverse lookup retains accurate GPS coordinates with an explicit coordinate label and asks the passenger to verify the pin or select a landmark; it never invents an address. Optional map rendering still uses the existing environment-configured public map token; that is separate from server-only geocoding credentials.
- Existing API `ROUTING_PROVIDER`, `ROUTING_API_URL`, and (for Mapbox) `MAPBOX_ROUTING_TOKEN` control road routing. Keep these on the API, never in frontend environment variables. Keep production's prohibition on the public OSRM demonstration service.
- Quote distance, duration and geometry continue to come from the API road-routing adapter. The map fits the complete returned route. There is no straight-line fare fallback.

## Release checks

1. Review approved-tariff, rounding, commission, surge-disabled and legacy-booking regression results.
2. Verify live Liberia autocomplete, selection and GPS reverse lookup on the approved account without capturing tokens or precise location histories.
3. Test real GPS on supported devices: permission denied, timeout, readings over 100 m, improvement to a good fix, and manual pickup changes during lookup.
4. Verify the route on a real browser map, including intermediate bends, and compare displayed distance/duration to the API response.
5. Confirm invalid, absent or stale quotes and incomplete/inactive passenger profiles cannot enable booking. Verify schedules remain 15 minutes to 30 days ahead.
6. Review tests and the complete diff before any deployment. Backend authorization and authoritative re-pricing remain in force.

## Address API contract

- `POST /api/v1/locations/search`, JSON `{ "query": "Broad Street" }`: returns `{ data: [{ id, address, latitude, longitude }] }`.
- `POST /api/v1/locations/reverse`, JSON `{ "latitude": 6.31, "longitude": -10.8 }`: returns `{ data: { id, address, latitude, longitude } | null }`.
- Both require a Passenger Bearer session and `Content-Type: application/json`. Combined limit: 60 requests/minute per authenticated user. Responses are private/no-store. Input goes in the body, never access-log query URLs. Provider requests time out after 8 seconds with no retries or redirects; errors are sanitized. No provider token or raw response is returned.

## Intended file set (including the preceding Passenger fixes)

- `.env.example`
- `apps/api/src/pricing-config.ts`
- `apps/api/src/pricing-config.test.ts`
- `apps/api/src/config.ts`
- `apps/api/src/config.test.ts`
- `apps/api/src/services/fare.ts`
- `apps/api/src/services/fare.test.ts`
- `apps/api/src/services/geocoding.ts`
- `apps/api/src/services/geocoding.test.ts`
- `apps/api/src/routes.ts`
- `apps/api/src/routes.security.test.ts`
- `apps/passenger/src.tsx`
- `apps/passenger/geolocation.ts`
- `apps/passenger/geolocation.test.ts`
- `apps/passenger/trip-input.ts`
- `apps/passenger/trip-input.test.ts`
- `apps/passenger/reverse-geocoding.ts`
- `apps/passenger/reverse-geocoding.test.ts`
- `packages/sdk/src.ts`
- `packages/sdk/src.test.ts`
- `packages/ui/src.tsx`
- `docs/openapi.yaml` (new location endpoints only; preserve prior unrelated edits)
- `docs/PASSENGER_BOOKING_REVIEW.md`

Unrelated root/workspace/web manifest edits, `.gitattributes`, and `.worktrees/` are not part of this change. Nothing has been committed, pushed, deployed, or configured in production.

## Verification results (2026-09-03)

- The new tariff/minimum regressions first failed against the old calculator, then passed after implementation.
- `pnpm lint --concurrency=2`: 11/11 workspace tasks passed.
- `pnpm typecheck --concurrency=2`: 11/11 workspace tasks passed.
- `pnpm build`: 11/11 workspace tasks passed; frontend bundle-size warnings remain.
- Focused Passenger suite: 16 tests passed. SDK suite: 9 tests passed.
- Full `pnpm test`: API 150 tests passed across 30 files, but the end-to-end suite failed during setup because PostgreSQL at localhost:5432 and local Redis were unavailable; nine scenarios were not executed. The root test command therefore failed and cancelled remaining workspace tasks. This is not a full-suite green result.
- Docker Compose configuration validation passed. Docker Desktop's Linux engine was unavailable; no test containers or database resources were created.
- Compiled backend runtime check: 15,600 m / 3,180 s = LRD 777 (driver 66,822 minor units, platform 10,878); 15,602 m / 3,204 s = LRD 778; 100 m / 60 s = minimum LRD 250. All used multiplier 1.0.
- Live provider integration, real browser map interaction and physical-device GPS remain unverified. These require approved backend geocoding activation and acceptance testing before release.
