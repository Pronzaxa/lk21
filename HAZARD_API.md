# Hazard API

Base URL backend default: `http://127.0.0.1:8787`.

`GET /api/hazards`

Optional query: `lat`, `lon`, `radius` (metres), `bbox=minLon,minLat,maxLon,maxLat`, and `type` from `FLOOD`, `ROAD_CLOSED`, `LANDSLIDE`, `FIRE`, `EARTHQUAKE_IMPACT`, `OTHER`.

`GET /api/hazards/snapshot` returns the same lightweight envelope and is intended for frontend persistence.

```json
{
  "generated_at": "2026-09-06T00:00:00.000Z",
  "last_successful_update": "2026-09-06T00:00:00.000Z",
  "data_state": "LIVE",
  "hazards": [{
    "id": "bmkg-earthquake-...",
    "source_id": "bmkg-...",
    "type": "EARTHQUAKE_IMPACT",
    "severity": "MEDIUM",
    "geometry": {"type":"Point","coordinates":[112.63,-7.97]},
    "source": "BMKG",
    "observed_at": "2026-09-06T00:00:00.000Z",
    "retrieved_at": "2026-09-06T00:01:00.000Z",
    "confidence": 1,
    "status": "ACTIVE",
    "freshness": "FRESH",
    "properties": {}
  }]
}
```

`data_state` is `LIVE`, `CACHED`, `STALE_CACHE`, or `UNAVAILABLE`. A stale response retains original `observed_at` and reports its prior successful update. No hazard is invented when providers and cache are unavailable.
