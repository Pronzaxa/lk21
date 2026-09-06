# Agent Demo Flow

## Persiapan lokal

1. Salin variable dari `backend/.env.example` ke `.env` tanpa memasukkan secret ke frontend.
2. Atur `AGENT_ENABLED=true` dan `AGENT_PROVIDER=local`.
3. Jalankan backend: `npm start` dari folder `backend`.
4. Pastikan `GET /health` bernilai `ok` dan `GET /api/capabilities` menunjukkan agent `READY`, provider `local`.

## Demo utama banjir

1. Buat SOS: “Saya dan ibu terjebak banjir, air sepinggang, ibu tidak bisa berjalan.”
2. Tunjukkan bahwa ACK tampil segera; plan belum menjadi syarat penerimaan laporan.
3. Buka Asisten untuk SOS aktif.
4. Status berubah dari “sedang memeriksa data” menjadi “Rencana evakuasi”.
5. Tunjukkan tujuan, route risk relatif, warning capacity/verification, dan “Mengapa?”.
6. Tekan “Lihat di Peta”; existing Map menampilkan destination dan geometry route plan.
7. Buka `GET /api/incidents/:id/agent-trace` saat demo developer untuk memperlihatkan tool-call sequence.

Data BMKG/PetaBencana/OSRM adalah data provider aktual atau cache berlabel. Tiga destination Malang berstatus `EXISTING_REFERENCE`, capacity `UNKNOWN`, dan bukan klaim shelter aktif.

## Demo failure

1. Atur `AGENT_ENABLED=false` atau pakai provider Hermes yang sengaja tidak dikonfigurasi.
2. Buat SOS.
3. ACK tetap berhasil dan insiden tetap aktif.
4. Plan tidak diklaim tersedia.

## Demo offline

1. Matikan koneksi browser dan buat SOS.
2. Local AI, Safety Engine, IndexedDB, panduan, GPS/map cache, dan outbox tetap berjalan.
3. Sambungkan jaringan kembali.
4. Queue mengirim capsule, backend memberi ACK, lalu agent job dibuat otomatis tanpa submit ulang.

## Demo Hermes

1. Konfigurasikan endpoint/model/key runtime yang mendukung chat-completions tool-calling.
2. Atur `AGENT_PROVIDER=hermes` dan restart backend.
3. Capability harus menunjukkan provider `hermes`, status `READY`.
4. Jalankan skenario utama dan verifikasi plan `created_by: HERMES` serta trace tetap tidak berisi chain-of-thought.

## Simulasi hazard change (P1)

Trigger `HAZARD_CHANGED` telah disiapkan pada queue, tetapi watcher otomatis belum termasuk MVP. Jika dipakai untuk presentasi sebelum watcher tersedia, labeli pemicuan manual sebagai **SIMULATION**.
