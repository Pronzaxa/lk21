# nuRESQ Premium UX Revision

## Ringkasan

Revisi ini memoles antarmuka yang sudah ada tanpa membangun ulang aplikasi dan tanpa mengubah mesin peta, tracking, safety, GPS trust, atau transport pesan.

## Perubahan utama

- Menata ulang visual shell desktop dan mobile dengan hierarchy yang lebih tenang, tegas, dan operasional.
- Mempertajam sistem warna graphite, emergency yellow, semantic status, border, dan elevation untuk dark serta light mode.
- Memperbaiki ikon navigasi **Pesan** menjadi `MessageSquareText` dan menyeragamkan labelnya menjadi **Pesan**.
- Memoles Beranda agar SOS menjadi satu focal action, sementara informasi pendukung tampil sebagai baris ringkas dan mudah dipindai.
- Memoles dialog SOS: progress, pilihan kejadian, tombol aksi, spacing, kontras, dan viewport behavior.
- Memoles halaman **Pesan & Asisten** tanpa menghapus fitur: quick action lebih jelas, input lebih fokus, serta batas antara asisten lokal dan komunikasi responder tetap jujur.
- Memoles halaman Akun menjadi daftar pengaturan yang lebih ringkas dan konsisten.
- Mengubah navigasi mobile menjadi dock yang lebih terarah, tetap mempertahankan urutan Beranda–Peta–SOS–Pesan–Akun.
- Menambahkan responsif untuk lebar 320 px, safe-area, landscape, serta reduced motion.
- Mempertahankan peta OpenStreetMap nyata, fallback raster, navigasi, tracking, dan seluruh logika safety yang sudah ada.

## Arah desain

Arah visual disusun dengan 12ui Design: dark graphite, kuning darurat yang terkendali, permukaan datar tanpa gradient AI, density efisien, dan motion hanya sebagai feedback sistem.

## Portable

Build portable tetap standalone. Pengguna akhir dapat menjalankan launcher atau membuka `PORTABLE/nuRESQ.html` tanpa npm maupun Node.js.
