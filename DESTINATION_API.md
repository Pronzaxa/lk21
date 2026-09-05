# Destination API

`GET /api/destinations` supports `lat`, `lon`, `radius`, `bbox`, and `type` from `HOSPITAL`, `SHELTER`, `EVACUATION_POINT`, `COMMAND_POST`, `OTHER`.

`GET /api/destinations/snapshot` returns the same lightweight response.

Existing reference points are deliberately returned with:

```json
{
  "status": "UNKNOWN",
  "verified": false,
  "capacity_status": "UNKNOWN",
  "source": "EXISTING_REFERENCE"
}
```

These fields must not be rendered as proof that a facility is open, safe, has capacity, or is an official shelter. The backend does not infer operational status from a name or coordinate.

`GET /api/map-data/status` reports hazard cache state and destination source state. It does not report base-map tile state; that remains the existing map provider's responsibility.
