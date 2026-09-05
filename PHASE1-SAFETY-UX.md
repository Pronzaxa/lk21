# Fase 1 — Safety UX

Asisten kini memakai `assistant-emergency.ts` sebelum panduan umum, dengan respons offline untuk banjir, gempa, kebakaran, longsor, dan medis. Normalisasi bahasa mencakup nggak/gak/tdk dan napas/nafas. Deteksi ini berbasis aturan, tidak mencakup semua variasi bahasa dan tidak mengubah severity insiden.

Sumber panduan: https://www.ready.gov/floods dan https://www.ready.gov/sites/default/files/2021-11/are-you-ready-guide.pdf; https://www.redcross.org/take-a-class/resources/learn-first-aid/unresponsive-and-breathing-person.

Tap SOS saat aktif → Saya sudah aman / Batalkan laporan → konfirmasi → penyimpanan lifecycle dan penghapusan pointer aktif dalam satu transaksi. Riwayat dipertahankan. Status penutupan bersifat lokal; tidak menyatakan responder diberi tahu. Insiden terminal dikeluarkan dari antrean pengiriman. Pembaruan kondisi lama ditolak jika insiden sudah terminal.

Menutup draft meminta konfirmasi kehilangan isian. Menutup ringkasan tersimpan mempertahankan insiden aktif. Keluar dari layar Pesan aktif memakai konfirmasi; menutup/reload tab menggunakan beforeunload browser. Browser menentukan teks dan dukungan dialog tersebut, dan penutupan paksa aplikasi tidak dapat dicegah.

Pengujian: `node --test tests/assistant-natural.test.mjs tests/incident-lifecycle.test.mjs`.
Build portable: `node node_modules/vite/bin/vite.js build --config portable/vite.config.ts` kemudian `node scripts/finalize-portable.mjs`.
