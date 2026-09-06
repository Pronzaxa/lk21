# Hermes Rescue Coordinator Integration

## Peran

Hermes adalah coordinator online untuk membuat `RescuePlan` berbasis bukti. Hermes bukan chatbot, severity classifier, routing engine, weather sensor, atau responder manusia. Priority dari Safety Engine selalu `priority_locked: true` dan harus dipertahankan persis.

Implementasi berada di `backend/agent/` dan memakai kontrak provider tunggal:

```js
provider.processIncident(input, tools, abortSignal)
```

Provider tersedia:

- `LocalCoordinatorProvider`: orkestrasi deterministik untuk pengembangan dan demo lokal. Label yang disimpan adalah `LOCAL_COORDINATOR`.
- `HermesCoordinatorProvider`: adapter HTTP tool-calling kompatibel endpoint chat-completions. Label yang disimpan adalah `HERMES`.

## Konfigurasi

Semua secret hanya berada di backend.

```env
AGENT_ENABLED=true
AGENT_PROVIDER=hermes
HERMES_MODEL=your-hermes-model
HERMES_ENDPOINT=https://your-runtime.example/v1/chat/completions
HERMES_API_KEY=replace-me
AGENT_TIMEOUT_SECONDS=30
AGENT_MAX_TOOL_CALLS=12
AGENT_MAX_ATTEMPTS=3
```

Untuk pengembangan tanpa runtime Hermes:

```env
AGENT_ENABLED=true
AGENT_PROVIDER=local
```

`GET /api/capabilities` selalu membedakan `local`, `hermes`, `READY`, `DISABLED`, dan `MISCONFIGURED` secara jujur.

## Tool-calling dan output

System prompt berada di `backend/agent/system-prompt.mjs`. Adapter mengirim tool definitions eksplisit, mengeksekusi hanya tool yang terdaftar, membatasi jumlah panggilan, dan mewajibkan action `saveRescuePlan`. Output divalidasi ulang sebelum disimpan. Perbedaan priority, geometri tidak valid, fasilitas tidak faktual, atau hasil tidak terstruktur ditolak.

## Timeout dan retry

Worker menggunakan `AbortSignal` dan hard timeout. Job gagal tidak mengubah ACK insiden. Retry disimpan sebagai `RETRYING` dengan batas percobaan. Setelah batas tercapai status menjadi `FAILED`; SOS tetap tersimpan dan aktif.

## Security

- Citizen text dan provider text diperlakukan sebagai untrusted data.
- Hermes tidak memiliki shell, filesystem, SQL, atau unrestricted internet tool.
- Tool argument memvalidasi UUID, koordinat, radius, route geometry, dan batas array.
- API key tidak pernah dikirim ke frontend atau disimpan dalam trace.
- Trace hanya menyimpan event, tool, ringkasan hasil, error code, dan rationale singkat; tidak menyimpan chain-of-thought.

## Runtime Hermes

Adapter mengharapkan response tool-calling dengan bentuk `choices[0].message.tool_calls`. Bila runtime Hermes memakai protokol berbeda, hanya `HermesCoordinatorProvider` yang perlu disesuaikan; service, schema, queue, trace, API, dan UI tidak perlu ditulis ulang.
