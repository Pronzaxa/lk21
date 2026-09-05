# Configuration

Defaults live in config/nuresq.config.ts. Before app startup, public/nuresq-config.js may populate window.__NURESQ_CONFIG__. The portable app reads its sibling nuresq-config.js. The single-file fallback inlines the same settings at build time. Do not place server secrets in either.

- AUTO: use local analysis always; online only after /health and /api/capabilities succeed.
- FORCE_OFFLINE: no backend health, enrichment or sync calls; local analysis and persistence continue. Existing public hazard/map services retain their own behavior; this flag controls the new hybrid backend channel, not a browser-wide network firewall.
- FORCE_ONLINE: attempt backend when browser permits; failure still falls back and never implies ACK.
- backendUrl: one centralized default http://127.0.0.1:8787. Set empty for LOCAL_ONLY; set HTTPS URL for deployment.
- backendHealthTimeoutMs: 2500. healthPollMs: 25000, plus online/offline transitions.
- localAI.enabled, runtime=`GGUF_SERVER`, serverUrl=`http://127.0.0.1:8790`, modelPath, version, classificationThreshold=.72, guideThreshold=.65, inferenceTimeoutMs=3500, loadTimeoutMs=20000. The GGUF server is started by `local-ai/START-SMOLLM2-WINDOWS.cmd`.
- offlineQueue.enabled: sync enablement. Durable local storage remains available. Retry 5,15,30,60,120 seconds; same IDs/payloads reused. Parent SOS before chronological updates. No deletion on failure.

Changing model package requires incrementing config version and validating its health identity. Model initialization is deferred until after initial shell rendering; SOS never waits for model initialization. Inference fallback is bounded by the configured timeout. Single-file mode uses rules because browser file URL restrictions prevent model loading. `ONNX_WEB` remains an explicit legacy compatibility mode; it is not the default.

Backend .env.example includes APP_ENV, HOST, PORT, DATABASE_PATH, CORS_ORIGINS, ALLOW_FILE_ORIGIN, AGENT_ENABLED=false. Cloud/agent capability stays disabled regardless of environment until an actual reviewed provider is implemented.
