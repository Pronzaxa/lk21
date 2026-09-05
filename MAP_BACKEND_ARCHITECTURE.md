# nuRESQ Map Data Backend

Backend ini hanya menjadi coordination layer untuk data darurat yang dikonsumsi sistem map existing. Ia tidak membuat tile, tidak menggambar MapLibre, tidak menghitung rute, dan tidak mengontrol GPS, camera, puck, atau navigation state.

```text
Existing Map UI -> MapDataClient -> connectivity
                         |              |
                 local existing     backend API
                 snapshot/cache      hazards/destinations
```

Services berada di `backend/map-data/services.mjs`:

- `MapDataService.getHazards(url)` — provider BMKG earthquake dan PetaBencana, normalisasi GeoJSON, filter area, freshness, cache SQLite, stale fallback.
- `MapDataService.getDestinations(url)` — referensi destination existing dengan `verified:false`, `status:UNKNOWN`, `capacity_status:UNKNOWN`.
- `MapDataService.getStatus()` — availability metadata.
- provider failure tidak diganti data sintetis: tanpa cache hasilnya `UNAVAILABLE` dan array kosong.

Database menambah `hazards_cache`, `destinations_cache`, dan `map_data_events`. Cache server bukan cache perangkat. IndexedDB/Cache Storage tetap menjadi tanggung jawab frontend existing.

Online: existing map tetap mengontrol map/routing, lalu client dapat mengambil hazard dan destination. Offline: backend tidak diperlukan; existing map, route, GPS, dan snapshot lokal tetap menjadi sumber runtime. Reconnect hanya memicu refresh data, bukan reload MapLibre atau reset camera.

`route_risk_service` sengaja `false`; tidak ada routing engine baru.
