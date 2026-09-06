# Rescue Coordinator Architecture

```text
Citizen App
  -> Local AI
  -> Deterministic Safety Engine
  -> locked priority + RESQ Capsule
  -> POST /api/incidents
  -> SQLite transaction: incident + real ACK + durable pending job
  -> HTTP ACK returned
  -> asynchronous AgentWorker
  -> one Rescue Coordinator provider (Local or Hermes)
  -> backend tools/services
     -> IncidentContextService
     -> HazardService -> MapDataService
     -> RouteService -> configured OSRM
     -> RouteRiskService (deterministic)
     -> DestinationService -> MapDataService
     -> RescuePlanService
  -> validated/versioned RescuePlan + Agent Trace
  -> existing Assistant / Map / responder state
```

## Reliability boundary

Insiden, ACK, dan pending agent job ditulis dalam satu SQLite transaction. Agent tidak dijalankan di request path. `res.end()` mengembalikan ACK, lalu worker diaktifkan melalui event-loop. Crash setelah ACK tidak kehilangan pending job; startup mengubah job `RUNNING` yang tertinggal menjadi `RETRYING`.

## Database

Tabel lama tidak diganti. Startup migration idempotent hanya menambahkan:

- `agent_jobs`: queue, trigger, provider, attempt, lifecycle, error.
- `agent_trace`: urutan event dan summary aman.
- `rescue_plans`: plan versioned dengan destination/route/actions/reasons/warnings/evidence terstruktur.

## Trigger

- `INCIDENT_CREATED`: dibuat satu kali bersama insiden.
- `INCIDENT_UPDATED`: dibuat hanya bila update membawa structured facts.
- `MANUAL_RECHECK`: endpoint eksplisit untuk diagnostik/operator.
- `HAZARD_CHANGED`: tipe queue sudah didukung sebagai hook P1; watcher perubahan hazard lintas-insiden belum diaktifkan pada MVP.

Unique key `(incident_id, trigger_type, trigger_ref)` mencegah duplicate job dari retry idempotent.

## Plan versioning

Plan baru menyimpan `version` dan `supersedes_plan_id`. Jika destination, route, action, dan warning tidak berubah material, plan baru tidak ditulis dan hasil ditandai `NO_MATERIAL_CHANGE`.

## UI boundary

Asisten aktif hanya membaca agent status dan RescuePlan. Ia tidak menjalankan agent. Destination dan geometri route plan diteruskan ke state Peta yang sudah ada. MapLibre, location puck, camera, tracking, reroute state machine, dan renderer tidak diganti.
