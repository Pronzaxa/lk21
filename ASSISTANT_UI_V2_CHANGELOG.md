# nuRESQ — Assistant UI V2 Changelog

Date: 2026-09-03
Scope: Assistant UX, active SOS semantics, current-condition presentation only.

## What changed

- Reworked active-incident Assistant into a calm contextual emergency layer instead of a nested dashboard/settings-style screen.
- Added a clear active lifecycle headline: **SOS AKTIF**. `Tersimpan` is now only secondary storage/delivery information.
- Separated incident lifecycle presentation from report delivery/acknowledgement presentation in `lib/nuresq/incident-state.ts`.
- Added an explicit active-incident pointer in `EmergencyRepository` (`active-incident-id`). `getIncidentHistory().at(-1)` is no longer used as the definition of an active emergency.
- `NuResqApp`, `AssistantHubPage`, and `MessagesPage` now resolve the same active incident through `EmergencyRepository.getActiveIncident()`.
- Active Assistant header now prioritizes: SOS active status, incident type, compact priority, honest confirmation status, then connection state. Incident ID is secondary metadata.
- Replaced the previous `KONDISI SAAT INI → incident ID / PESAN INSIDEN` layout with **KONDISI ANDA** using existing incident facts only: victim count, parsed water level, mobility limitation, and existing injury red flags.
- Missing facts are hidden rather than filling the screen with `Unknown` / `Belum diketahui` fields.
- `Perbarui kondisi` is now the primary action. It opens the existing responder/update path with a condition-update draft and does not overwrite the incident directly.
- `Ringkas`, `Panduan`, and `Peta` are compact secondary contextual actions instead of a settings-style menu with chevrons.
- Added a real Assistant input in active-incident mode with contextual suggestion chips. Normal Assistant interaction remains local/contextual and is not sent as an emergency message.
- Reduced Sparkles usage to Assistant identity/results.
- Reduced nested cards, borders, and dark-on-dark shells. Active content uses spacing, typography, and one shared context surface for hierarchy.
- Added first-class light-theme styling so the Assistant does not remain a full dark slab inside the light application shell.
- Updated Home active report copy from `LAPORAN SOS TERSIMPAN` / `SOS TERSIMPAN OFFLINE` to **SOS AKTIF**, while retaining honest secondary delivery information.
- Updated SOS completion copy so storage is not presented as incident completion.
- Preserved responder messaging, queue, ACK, relay, map, navigation/tracking, and Safety Engine implementations.

## Files changed

- `components/nuresq/assistant/AssistantHubPage.tsx`
- `components/nuresq/NuResqApp.tsx`
- `components/nuresq/SosFlow.tsx`
- `components/nuresq/messages/MessagesPage.tsx`
- `lib/nuresq/emergency-repository.ts`
- `styles/nuresq-assistant.css`

## Files added

- `lib/nuresq/incident-state.ts`
- `tests/assistant-ui-v2-regression.test.mjs`
- `ASSISTANT_UI_V2_CHANGELOG.md`
- `ACTIVE_SOS_STATE.md`

## Explicitly preserved

The following files are byte-for-byte unchanged from the supplied Assistant Hub revision:

- `lib/nuresq/safety.ts`
- `components/nuresq/SafetyMap.tsx`
- `lib/nuresq/message-transport.ts`
- `lib/nuresq/navigation-engine.ts`

No local AI model, new external API, fake responder, or fake server acknowledgement was added.
