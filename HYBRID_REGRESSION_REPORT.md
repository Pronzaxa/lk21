# Hybrid foundation verification — 2026-09-05

## SmolLM2 GGUF replacement — 2026-09-06

- Source file copied and hashed: `SmolLM2-135M-Instruct-Q3_K_M.gguf`, 93,510,496 bytes, SHA-256 `0B431BE309B25C9496463B3362D89A7156C44CDD899EE64F1390F11A059188EF`.
- Native runtime installed in the project environment: `llama-cpp-python==0.3.35`.
- Real local health check passed on `127.0.0.1:8790`; identity matched runtime and model filename.
- Real inference passed for `Tolong, air banjir masuk rumah dan kami berdua terjebak`; output was `FLOOD`, then deterministic fusion remains authoritative.
- Frontend default is now `GGUF_SERVER`. ONNX is no longer active by default and remains only as explicit legacy compatibility.
- New release: `nuRESQ-SmolLM2-GGUF-LocalAI.zip`; package inspection confirmed both portable and source model assets, with no `node_modules`, `.ml-venv`, `.env`, or test database.

## Executed checks

- Citizen TypeScript: `node node_modules/typescript/bin/tsc --project tsconfig.citizen.json` — passed.
- Portable Vite build and finalize — passed; bundle-size warning remains (main JS about 1.75 MB before gzip, CSS about 389 KB, separate WASM about 14 MB).
- `node --test --test-concurrency=1 tests/assistant-natural.test.mjs tests/incident-lifecycle.test.mjs tests/hybrid-foundation.test.mjs tests/local-ai-state.test.mjs tests/smart-messaging.test.mjs backend/tests/backend.test.mjs` — 36/36 passed.
- Tests include natural Indonesian, explicit facts defeating AI, low-confidence fallback, lifecycle preservation, no delivery for closed incidents, actual health transition contract, original-before-update ordering, retry/backoff, immutable original ACK, separate update ACK, missing/corrupt/timed-out model, browser fetch receiver, backend ownership, invalid requests and SQLite restart.
- Browser at localhost:4173: actual ONNX worker reached READY, shown as “Siap digunakan”; assistant understood “Tolong air masuk rumah kami kejebak berdua” and returned local flood guidance without automatically creating SOS. Backend health succeeded and UI displayed “Terhubung”.
- Model CPU evaluation executed: 9/12 authored examples correct (75%). This is a tiny development sample, not a representative independent benchmark or calibrated probability. See ml/EVALUATION_REPORT.json.

## Not a production safety sign-off

Synthetic SOS was saved through the browser UI against an isolated in-memory backend. Server emitted a genuine original ACK and Home displayed “Sistem telah menerima laporan.” No real responder was contacted. This check also exposed stale final-dialog copy, subsequently changed to subscribe to repository ACK updates.

Five dedicated existing Safety Core probes FAIL; see BLOCKING_SAFETY_CORE_ISSUES.md. They are not hidden inside the passing integration count. Core was intentionally not rewritten. Existing full-project build has unrelated environment dependencies (Cloudflare/build plugin); focused citizen typecheck and portable build are the validated targets.

Real mobile-device memory/latency, voice permissions, actual GPS/camera, real responder delivery, exhaustive end-to-end offline reload, and production deployment were not verified. Automated timeout tests use controlled workers; actual successful model load was additionally verified in the browser. Do not interpret mock failure coverage as physical-device testing.
