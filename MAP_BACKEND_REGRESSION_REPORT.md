# Map backend regression report — 2026-09-06

## Scope proof

Changed backend/service and contract files only. No MapLibre component, map style/layer, tracking loop, GPS hook, puck, camera, recenter, routing engine/provider, navigation UI, offline map UI, bottom navigation, Beranda, SOS, Asisten, or Akun file was changed for this task.

The only frontend-facing addition is three public methods on `BackendClient` (`getHazards`, `getDestinations`, `getMapDataStatus`). They do not alter map rendering and are not wired directly into MapLibre.

## Automated checks

- `node --test backend/tests/map-data.test.mjs backend/tests/backend.test.mjs`: 3/3 passed for map/backend tests plus existing backend persistence test.
- Covered: truthful capabilities, public map data endpoints, normalized provenance/timestamps/GeoJSON, destination filters and unknown status, invalid bbox, provider failure, stale cache, unavailable response, and no routing capability.
- Existing hybrid/local AI tests remained passing before this backend-only change; no map frontend test was rewritten.

## Known limitations

- BMKG earthquake and PetaBencana are the current provider adapters. Weather parsing remains in the existing application route and was not duplicated into the backend.
- Destination data is the existing local reference set and is intentionally unverified. No live hospital/shelter availability is claimed.
- Server cache is SQLite and query-area keyed. Device snapshot persistence remains the responsibility of the existing frontend offline layer.
- No tile server, map pack, PMTiles/MBTiles, routing engine, SafeRoute, or agent runtime was added.
