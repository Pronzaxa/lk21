# Active SOS State — V2

## Product model

nuRESQ now treats two concepts separately:

1. **Incident lifecycle** — whether the emergency is active, resolved, or cancelled.
2. **Delivery lifecycle** — whether the report is only stored locally, queued, sending, acknowledged by the system, or evidenced as received/read by a responder.

`Tersimpan di perangkat` therefore does **not** mean the emergency is finished.

## Active incident source of truth

`EmergencyRepository` owns an explicit metadata pointer:

`active-incident-id`

A newly saved active SOS writes this pointer. `NuResqApp`, `AssistantHubPage`, and `MessagesPage` all use `EmergencyRepository.getActiveIncident()`.

The application deliberately does **not** use:

`getIncidentHistory() -> latest item -> active`

because a latest historical report can be resolved, cancelled, archived, or simply old.

## Terminal lifecycle compatibility

The current supplied `EmergencyIncident` schema has no official lifecycle field yet. The V2 resolver therefore:

- recognizes explicit lifecycle-like runtime fields when present (`incident_lifecycle`, `lifecycle`, `incident_status`);
- recognizes terminal values such as resolved/completed/archived/cancelled;
- otherwise treats only the incident selected by the explicit active pointer as active.

This is intentionally conservative: old history without an active pointer is not silently promoted into an active emergency.

## Presentation rules

### Stored locally / offline

Primary:

**SOS AKTIF**

Secondary:

`Tersimpan di perangkat.`

`Menunggu jalur pengiriman.`

### Connected but no verified acknowledgement

Primary:

**SOS AKTIF**

Secondary:

`Belum ada konfirmasi dari sistem.`

or while a send attempt is in progress:

`Sedang menunggu konfirmasi sistem.`

### Verified system acknowledgement

Only when the existing acknowledgement validation succeeds:

**SOS AKTIF**

`Sistem telah menerima laporan.`

This does not imply a responder has been assigned.

### Responder evidence

Only real responder message/receipt/read evidence can surface:

- `Responder telah menerima laporan.`
- `Responder telah melihat laporan.`

No UI copy says that help is on the way unless real backend/responder data supports it.

## Resolution

The supplied source does not contain a user-facing incident-resolution/cancellation workflow, so this revision does not invent one. If a future/external write supplies an explicit terminal lifecycle value, `getActiveIncident()` stops returning it and clears the active pointer. Historical data remains available from **Akun → Riwayat Laporan**.
