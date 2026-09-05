# ASSISTANT_FLOW

## Mental model final

```text
                         nuRESQ
                ┌──────────┴──────────┐
                │                     │
            NON-URGENT              URGENT
                │                     │
             ASISTEN                  SOS
                │                     │
       question / guide        emergency report
                │                     │
                │              ACTIVE INCIDENT
                │                     │
                └──────────┬──────────┘
                           ▼
                        ASISTEN
                   ┌───────┴────────┐
                   │                │
                ASISTEN          RESPONDER
                   │                │
             local/context       Smart Messaging
             guidance            internet/relay
             explanation         local queue
             update support      ACK tracking
```

## A. Tidak ada insiden aktif

1. User membuka **Asisten**.
2. Tidak ada SOS yang dibuat otomatis.
3. User dapat membuka Panduan Darurat, memeriksa konteks sekitar yang benar-benar tersedia, membuka Peta, atau menceritakan kondisi.
4. Pertanyaan diproses lokal menggunakan field guide / parser / safety signal / capability yang tersedia.
5. Pertanyaan umum **bukan** `EmergencyMessage` dan tidak masuk transport responder.
6. Jika terdeteksi kondisi penting, UI menampilkan rekomendasi **Buat Laporan SOS** dan pilihan **Tetap di Asisten**.
7. Hanya pilihan user pada CTA SOS yang membuka existing `SosFlow`.

## B. Insiden aktif

1. User membuka **Asisten**.
2. Latest incident dibaca dari `EmergencyRepository`.
3. Default internal mode adalah **Asisten**.
4. Asisten dapat merangkum konteks, membuka panduan, membuka Peta, atau memulai pembaruan kondisi.
5. User dapat berpindah ke **Responder**.
6. Responder memakai existing `MessagesPage` dan Smart Messaging transport.

## C. Pesan responder

```text
User message
    ↓
local save first
    ↓
MessageTransportManager
    ↓
DIRECT_INTERNET / NODE_RELAY / LOCAL_QUEUE
    ↓
ACK/receipt state
    ↓
UI wording yang sesuai bukti
```

Tidak ada delivery checkmark untuk percakapan Assistant umum. Delivery state hanya berlaku untuk komunikasi responder/incident update yang benar-benar melalui transport.

## D. Tap SOS saat insiden sudah aktif

Tap SOS → **Active Incident Sheet** → user memilih:

- Lihat Ringkasan → Asisten.
- Perbarui Kondisi → Responder dengan draft konteks.
- Buka Responder → Responder.
- Tutup → tetap di halaman sekarang.

SOS tidak berubah label dan tidak menjadi shortcut tersembunyi ke Asisten.

## E. Riwayat

`Akun → Riwayat Laporan → EmergencyRepository.getIncidentHistory()`.

Tidak ada database atau storage history baru.
