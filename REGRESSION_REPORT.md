# nuRESQ — Assistant UX V2 Regression Report

Date: 2026-09-03

## Automated static regression

Executed:

`node tests/assistant-ui-v2-regression.test.mjs`

Result:

**31 / 31 checks passed.**

Coverage includes:

- bottom navigation remains `Beranda — Peta — SOS — Asisten — Akun`;
- SOS label remains SOS;
- active incident is resolved explicitly instead of from latest history;
- Home and Assistant use `SOS AKTIF` as the lifecycle status;
- stored/offline state remains secondary delivery information;
- `PESAN INSIDEN` is not used as current-condition content;
- condition UI uses available incident/parser facts and hides low-value unknowns;
- incident ID is secondary metadata;
- `Perbarui kondisi` is the primary active action;
- compact Ringkas/Panduan/Peta actions exist;
- active Assistant input exists;
- Asisten/Responder remains a two-mode switch;
- general Assistant does not use emergency-message transport semantics;
- explicit active-incident metadata exists and can be cleared;
- verified acknowledgement remains required before system-received wording;
- active UI outer surface is no longer a giant nested card;
- light-theme V2 surfaces are present;
- active mobile styles remain responsive.

The previous Assistant Hub static regression suite was also executed:

`node tests/assistant-hub-regression.test.mjs`

Result:

**20+ checks passed.**

## Syntax verification

The modified TypeScript / TSX files were passed through the installed TypeScript compiler's `transpileModule` parser. All modified TS/TSX files parsed successfully.

This is a syntax check, not a full dependency-aware application build.

## No-change integrity checks

SHA-256 was compared against the previous supplied/revised package. The following are byte-for-byte unchanged:

- `lib/nuresq/safety.ts`
- `components/nuresq/SafetyMap.tsx`
- `lib/nuresq/message-transport.ts`
- `lib/nuresq/navigation-engine.ts`

Therefore this V2 task did not rewrite Safety Engine, MapLibre/SafetyMap, messaging transport, or navigation-engine logic.

## Portable verification

The existing no-install production bundle is retained and receives an inline **Assistant UX V2 compatibility patch** in both:

- `PORTABLE/app/index.html`
- `PORTABLE/nuRESQ.html`

The patch JavaScript was extracted and checked with `node --check` successfully.

The portable patch adds the V2 visual hierarchy, genuine light surfaces, active pointer metadata support for new SOS completions, current-condition facts, contextual actions, Assistant input, and quieter transport copy without adding runtime npm/Node requirements.

## Build / screenshot limitation

A fresh full Vite/Next production rebuild cannot be truthfully claimed in this environment because project dependencies are not installed locally and the earlier dependency registry lookup was unavailable. The portable package therefore keeps the already bundled application runtime and applies the V2 compatibility layer without new runtime dependencies.

Automated browser screenshot capture was attempted, but the sandbox browser blocked navigation to both local HTTP and `file://` targets (`ERR_BLOCKED_BY_ADMINISTRATOR`). No generated screenshot is included rather than fabricating a visual-verification claim.

## Known limitation

The original persisted `EmergencyIncident` schema has no official resolved/cancelled field and the supplied app has no user-facing resolve/cancel flow. V2 avoids the unsafe `latest history = active` rule by using an explicit active pointer. Legacy historical data that predates this pointer is not automatically promoted to active. A future lifecycle feature should write an explicit terminal lifecycle state and clear the pointer through the repository helper.
# Hermes Rescue Coordinator regression addendum

The Rescue Coordinator revision preserves the existing local AI, deterministic Safety Engine, IndexedDB/outbox, SOS lifecycle, responder messaging, MapLibre renderer, navigation camera, tracking, location puck, and route rendering. New integration is limited to backend job/plan APIs, a compact plan section in the active Assistant, and a typed handoff of factual destination/route data into the existing map state.

Automated coverage is located in `backend/tests/rescue-coordinator.test.mjs` and `backend/tests/hermes-provider.test.mjs`. It verifies ACK independence, job idempotency, structured persistence, priority lock, prompt-injection boundary, no invented destination/route when location is absent, deterministic route risk, truthful capabilities, Hermes tool calls, invalid unstructured output, and missing Hermes configuration.

Validation on 2026-09-06: 12/12 backend tests passed, TypeScript compilation passed, portable Vite production build passed, and all standalone legacy UI/safety/navigation/offline tests passed. The two legacy tests that require `dist/server` remain unavailable in this checkout because `vite.config.ts` references the absent generated file `build/sites-vite-plugin`; no substitute plugin was fabricated. Portable output and the standalone Node backend are unaffected.
