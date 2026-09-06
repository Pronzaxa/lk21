# Deploy Hermes Rescue Coordinator

## Persyaratan

- Node.js 22.16 atau lebih baru.
- Volume persisten untuk SQLite.
- HTTPS reverse proxy pada VPS.
- Runtime Hermes yang mendukung tool-calling chat-completions jika provider `hermes` dipilih.

## Langkah

1. Salin source `backend/` dan `public/emergency-guides/`.
2. Buat `.env` dari `.env.example`.
3. Set `APP_ENV=production`, `HOST=0.0.0.0`, path database persisten, dan origin frontend yang tepat.
4. Pilih `AGENT_PROVIDER=local` untuk smoke test atau `hermes` untuk runtime online.
5. Simpan `HERMES_API_KEY` hanya sebagai VPS secret.
6. Jalankan `node --env-file-if-exists=.env server.mjs`.
7. Periksa `/health` dan `/api/capabilities`.
8. Jalankan backend tests sebelum membuka trafik.

## Container

Build dari root source:

```bash
docker build -f backend/Dockerfile -t nuresq-backend .
docker run --env-file backend/.env -p 8787:8787 -v nuresq-data:/app/backend/data nuresq-backend
```

Gunakan satu instance untuk SQLite MVP. Untuk horizontal scaling, pindahkan queue/plan database ke datastore transaksional bersama sebelum menambah replica.

## Operasional

- Backup volume database.
- Batasi akses endpoint dengan HTTPS dan bearer-token policy production.
- Pantau jumlah `FAILED`/`RETRYING`, durasi agent, dan provider error.
- Jangan menyamakan agent `COMPLETED` dengan responder assignment.
- Rotasi key yang pernah terekspos sebelum deployment.
