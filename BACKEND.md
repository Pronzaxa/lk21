# Backend foundation

Node.js >=22.16, built-in HTTP and SQLite (experimental API on Node 22). No npm installation needed for backend. From backend, run START-BACKEND.bat or `node --env-file-if-exists=.env server.mjs`. Copy .env.example to .env to customize. Default bind 127.0.0.1:8787.

GET /health and /api/capabilities are public and never cached. Citizen generates a random per-installation bearer token in IndexedDB; protected resources are scoped to its hash in SQLite. No shared API secret ships in frontend. Losing browser storage loses access to that installation's server records. This is a foundation identity mechanism; no user-account recovery or responder access exists yet.

Endpoints: POST/GET /api/incidents; GET /api/incidents/:id; POST /api/incidents/:id/updates; POST /api/assistant/analyze; GET /api/guides and /api/guides/:id. IDs must be UUIDs (legacy NR-UUID is accepted). schema_version=1 required for writes. Coordinates, dates, counts, enums, priority and ownership checked. Payload limit 32 KiB. Safe JSON errors. CORS exact allowlist; null file origin only in development. Per-address rate limit applies to nonduplicate protected operations; duplicate incident/update retry reuses ACK.

SQLite WAL tables: incidents, incident_updates, incident_acknowledgements, assistant_events, system_events. ACK writes and data insert commit in one transaction. Original acknowledgement is immutable; each update has its own ACK. Server priority cannot fall below existing locked priority. Incoming timestamps are retained; server received_at is separate. Backend does not perform diagnosis or cloud generation.

VPS: use APP_ENV=production, set HOST/PORT/DATABASE_PATH/CORS_ORIGINS, disable ALLOW_FILE_ORIGIN, put a TLS reverse proxy in front, and run under a service account with a persistent data volume. No frontend code change needed beyond backendUrl configuration. Reverse-proxy authentication for operators, account recovery, backups and operational rate policies are future deployment work. Do not expose this as a public emergency service before the blocking Safety Core issues are resolved and security reviewed.

Run tests: `node --test backend/tests/backend.test.mjs` from SOURCE-CODE. Production startup does not seed mock incidents, responders or agents.
