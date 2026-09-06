# Rescue Coordinator Tools

Semua tool memanggil backend service. Tidak ada business logic yang diduplikasi di adapter Hermes.

## `getIncidentContext`

- Tujuan: membaca insiden, priority terkunci, lifecycle, lokasi, fakta korban, update terkonfirmasi, dan plan terakhir.
- Input: `{ incident_id: UUID }`.
- Output: structured incident context tanpa kontak, token, atau raw frontend state.
- Error: `INVALID_INCIDENT_ID`, `INCIDENT_NOT_FOUND`.
- Deterministik: ya.

## `getHazards`

- Tujuan: membaca hazard dari `MapDataService`.
- Input: `{ lat, lon, radius_m }`; radius 100–100.000 meter.
- Output: `{ data_state, hazards, generated_at, last_successful_update }`.
- Sumber: BMKG, PetaBencana, atau cache backend yang sudah diberi provenance.
- Error/data kosong: `data_state: UNAVAILABLE`, tidak membuat hazard palsu.
- Deterministik: normalisasi ya; sumber eksternal dapat berubah.

## `getRouteAlternatives`

- Tujuan: meminta geometri route nyata dari provider routing yang sudah dikonfigurasi.
- Input: `{ origin, destination, travel_mode: "driving" }`.
- Output: route id, GeoJSON LineString, distance, duration, provider, retrieved time.
- Sumber: OSRM endpoint.
- Error: `ROUTING_DISABLED`, `TRAVEL_MODE_UNAVAILABLE`, `ROUTING_TIMEOUT`, atau `UNAVAILABLE` dengan routes kosong.
- Deterministik: tidak; bergantung provider. Tidak pernah membuat geometry fallback palsu.

## `evaluateRouteRisk`

- Tujuan: menghitung paparan relatif route terhadap hazard berkoordinat.
- Input: routes faktual, hazards faktual, travel mode.
- Output: `risk_score` 0–100 dan reasons per route.
- Data source: hanya input tool sebelumnya.
- Deterministik: ya. Model tidak menghitung score.

## `getDestinations`

- Tujuan: membaca destination reference dari `MapDataService`.
- Input: incident type, location, radius, required capabilities.
- Output: destination faktual, jarak, status verifikasi, capacity status, dan source.
- Freshness: mengikuti source status. `UNKNOWN` tetap `UNKNOWN`.
- Deterministik: ya terhadap snapshot data.

## `evaluateDestination`

- Tujuan: menilai suitability dari jenis insiden, mobilitas, verifikasi, capacity, distance, dan route risk.
- Input: satu destination faktual dan faktor terstruktur.
- Output: score, reasons, warnings.
- Deterministik: ya. Model tidak menghitung score.

## `saveRescuePlan`

- Tujuan: action final yang memvalidasi dan menyimpan plan.
- Input: canonical structured RescuePlan.
- Output: plan tersimpan dan indikator material change.
- Error: invalid plan, priority lock violation, invalid route/destination.
- Deterministik: ya.

Semua panggilan dicatat sebagai `TOOL_CALL` dan `TOOL_RESULT` dalam trace dengan summary terbatas, bukan payload pribadi penuh.
