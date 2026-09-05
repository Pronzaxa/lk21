# nuRESQ Smart Messaging + AI Assist — Changelog

## Ruang lingkup

Revisi ini hanya mengubah pengalaman **Pesan** dan lapisan data yang diperlukan untuk menyimpan serta mengirim pesan. Beranda, Peta, MapLibre, tracking/navigasi, SOS, Akun, Safety Engine, service worker, dan struktur bottom navigation tidak direfaktor.

## Perubahan utama

- Mengganti tampilan Riwayat pada route `pesan` menjadi pusat komunikasi insiden.
- Mengembalikan label navigasi menjadi **Pesan** dengan urutan tetap: Beranda — Peta — SOS — Pesan — Akun.
- Menambahkan header insiden ringkas: ID, jenis kejadian, prioritas existing, dan status jalur komunikasi yang dapat dibuktikan.
- Menambahkan percakapan dengan tipe visual berbeda untuk user, responder terverifikasi, system event, AI insight, dan delivery event.
- Menambahkan composer yang tetap aktif ketika offline, AI Assist, input suara bila browser mendukung, serta penjelasan jujur ketika dikte offline tidak tersedia.
- Menambahkan Asisten nuRESQ untuk ringkasan, saran pembaruan SOS, perbandingan kondisi, versi pesan ringkas, dan penjelasan pesan responder.
- Analisis default menggunakan parser deterministik lokal. UI tidak mengklaim model AI lokal tersedia jika capability tidak terpasang.
- Perubahan kondisi tidak pernah langsung menimpa SOS. User harus mengonfirmasi, kemudian Safety Engine existing menghitung prioritas.

## Delivery dan offline

- Pesan memiliki ID stabil untuk retry dan deduplikasi.
- Pesan disimpan ke IndexedDB sebelum percobaan transport.
- Status delivery eksplisit: `DRAFT`, `LOCAL_SAVED`, `QUEUED`, `SENDING`, `RELAYING`, `GATEWAY_RECEIVED`, `SERVER_ACKNOWLEDGED`, `RESPONDER_RECEIVED`, `RESPONDER_READ`, dan `FAILED`.
- Event jaringan kembali tidak dianggap sebagai bukti pesan terkirim.
- `SERVER_ACKNOWLEDGED` hanya digunakan setelah ACK server valid.
- Pesan relay hanya menjadi `GATEWAY_RECEIVED` sampai ACK server benar-benar tersedia.
- Gagal mengirim kembali ke antrean tanpa menghapus pesan lokal.

## Safety dan trust

- AI Assist tidak berperan atau tampil sebagai responder.
- Pesan responder hanya dapat dibuat melalui factory yang mewajibkan receipt terverifikasi.
- Parser tidak menentukan severity; hasilnya hanya structured facts.
- React merender pesan sebagai teks, tanpa `dangerouslySetInnerHTML`.
- Media belum diaktifkan dan tidak disamarkan sebagai fitur yang siap.
- Tidak ada backend, relay, receipt, atau ACK simulasi pada mode produksi default.

## Pengujian

`tests/smart-messaging.test.mjs` mencakup:

- ekstraksi perubahan penting dan negasi;
- pesan ringkas tanpa fakta tambahan;
- create/send offline dan persist queue;
- reconnect tanpa fake delivery;
- HTTP tanpa ACK;
- ACK server nyata;
- retry dengan ID sama;
- relay gateway tanpa klaim server;
- konfirmasi pembaruan SOS melalui Safety Engine existing;
- receipt responder;
- batas scope, IndexedDB, responsive 360 px, dan safe area.

Portable test juga memastikan fitur Pesan dan wording offline tersedia di bundle tanpa npm.

## Bagian yang sengaja tidak berubah

- `components/nuresq/SafetyMap.tsx`
- `components/nuresq/navigation/*`
- `hooks/useNavigationState.ts`
- `hooks/useNavigationTracking.ts`
- `hooks/useTrustedLocation.ts`
- `lib/nuresq/navigation*.ts`
- `lib/nuresq/safety.ts`
- `components/nuresq/SosFlow.tsx`
- `components/nuresq/AccountView.tsx`
- `public/sw.js`
- stylesheet Peta dan SOS

