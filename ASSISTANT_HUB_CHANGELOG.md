# ASSISTANT_HUB_CHANGELOG

## Ringkasan

Revisi ini mengubah konsep publik **Pesan** menjadi **Asisten** tanpa membongkar arsitektur nuRESQ. Identifier internal `"pesan"` dipertahankan untuk kompatibilitas routing, tetapi seluruh navigasi utama yang terlihat pengguna memakai **Asisten** dengan ikon `Sparkles`.

## Perubahan produk

- Navigasi publik menjadi **Beranda — Peta — SOS — Asisten — Akun**.
- SOS tetap tombol darurat utama di tengah. Label tidak lagi berubah menjadi `Tersimpan` ketika insiden aktif.
- Tap SOS saat insiden aktif membuka ringkasan/status insiden, bukan redirect tersembunyi ke Asisten dan bukan membuat insiden duplikat.
- Asisten sekarang dapat digunakan tanpa membuat SOS.
- General Assistant memakai panduan lokal, parser/safety yang sudah ada, konteks lokasi/hazard yang benar-benar tersedia, dan fallback eksplisit. Tidak ada LLM lokal atau cloud yang dipalsukan.
- Pertanyaan biasa di Asisten dipisahkan secara semantik dari `EmergencyMessage`; pertanyaan itu tidak dikirim ke backend, relay, atau responder.
- Jika teks menunjukkan kondisi penting, Asisten hanya **menyarankan** SOS. Existing `SosFlow` tetap menjadi satu-satunya jalur membuat laporan.
- Saat insiden aktif, Asisten mempunyai dua mode internal: **Asisten** dan **Responder**. Mode Responder membungkus ulang Smart Messaging yang sudah ada.
- Riwayat dipindahkan secara akses publik ke **Akun → Riwayat Laporan**, memakai `EmergencyRepository.getIncidentHistory()` tanpa database baru.
- Tombol attachment responder yang belum fungsional dihapus dari composer agar tidak memberi affordance palsu.
- Copy teknis seperti “parser deterministik/model lokal” disederhanakan menjadi bahasa citizen-facing seperti “Analisis lokal” atau “Bantuan lokal”.

## Smart Messaging yang dipertahankan

`MessagesPage`, `ConversationList`, `AIInsightPanel`, `SmartMessageComposer`, `useEmergencyMessages`, `MessageTransportManager`, local persistence, retry, relay-ready transport, server ACK, responder receipt/read, delivery detail, dan structured incident update tidak diganti dengan model `sent=true` sederhana.

## Offline dan relay

- Assistant umum tetap lokal dan tidak memakai delivery state.
- Pesan Responder tetap disimpan lebih dulu dan menggunakan transport existing.
- Wording diterima/dibaca tetap bergantung pada ACK/receipt nyata.
- Copy field guide offline diperbarui agar status diperiksa melalui **Asisten → Responder**.

## Portable/no-install

Source TypeScript adalah implementasi utama. Environment pengerjaan tidak dapat mengakses `registry.npmjs.org`, sehingga dependency build tidak dapat dipulihkan untuk menghasilkan bundle Vite baru. Agar paket portable tetap dapat dijalankan tanpa instalasi, bundle portable existing dipertahankan dan diberi **scoped compatibility patch** (`assistant-hub-portable-patch.html`, di-inline ke `nuRESQ.html` dan `app/index.html`) untuk flow/navigasi Asisten dan SOS. Tidak ada runtime dependency baru.

## File source yang diubah/ditambahkan

- `app/globals.css`
- `components/nuresq/NuResqApp.tsx`
- `components/nuresq/SosFlow.tsx`
- `components/nuresq/AccountView.tsx`
- `components/nuresq/assistant/AssistantHubPage.tsx` (baru)
- `components/nuresq/messages/MessagesPage.tsx`
- `components/nuresq/messages/SmartMessageComposer.tsx`
- `components/nuresq/messages/AIInsightPanel.tsx`
- `components/nuresq/messages/MessageSheets.tsx`
- `lib/nuresq/field-guides.ts`
- `styles/nuresq-assistant.css` (baru)
- `styles/nuresq-responsive.css`
- `styles/nuresq-light.css`
- `tests/assistant-hub-regression.test.mjs` (baru)

## File portable yang diubah/ditambahkan

- `PORTABLE/nuRESQ.html`
- `PORTABLE/app/index.html`
- `PORTABLE/assistant-hub-portable-patch.html` (baru, sumber patch yang di-inline)

Map/navigation dan Safety Core tidak dimodifikasi.
