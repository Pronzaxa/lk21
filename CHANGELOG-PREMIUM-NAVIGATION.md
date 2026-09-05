# nuRESQ Premium Navigation & Tracking

Tanggal: 30 Agustus 2026

## Ringkasan

Revisi ini memoles pengalaman peta dan navigasi tanpa mengubah identitas visual, alur SOS, penyimpanan IndexedDB, atau launcher portable nuRESQ. Peta tetap menjadi antarmuka utama ketika navigasi aktif, sedangkan informasi perjalanan dibatasi pada instruksi atas, kontrol peta, dan panel perjalanan bawah.

## Perubahan utama

- Menambahkan state machine navigasi terpusat untuk preview, starting, follow, free-pan, recenter, rerouting, GPS lemah/stale, direction-only offline, arriving, arrived, dan ended.
- Menambahkan pelacakan lokasi nyata berbasis `navigator.geolocation.watchPosition()` dengan validasi GPS yang sudah ada. Lokasi mentah/tepercaya untuk keselamatan tidak pernah diganti oleh posisi visual yang di-snap ke rute.
- Menambahkan mode simulasi eksplisit melalui `?demo-nav=1`. Koordinat simulasi diberi label **SIMULASI**, dipisahkan dari GPS nyata, dan tidak pernah digunakan sebagai lokasi SOS.
- Menambahkan camera controller MapLibre untuk follow, heading-up, dan overview dengan easing, pitch, padding UI, offset puck, hysteresis zoom, serta interpolasi bearing melalui lintasan sudut terpendek.
- Mengganti marker lokasi navigasi dengan puck berarah, accuracy circle, dan state visual khusus untuk GPS lemah, mencurigakan, atau stale.
- Menambahkan route casing, route aktif, route yang telah dilalui, route tersisa, alternatif route, serta garis putus-putus yang berbeda untuk **ARAH TUJUAN**.
- Menambahkan perhitungan progress visual dengan nearest-route projection. Raw GPS tetap dipakai untuk trust dan data emergency.
- Menambahkan maneuver card yang ringkas dengan ikon belokan, jarak aktual, instruksi utama, dan maneuver berikutnya ketika provider menyediakannya.
- Menambahkan trip panel compact/expanded untuk sisa waktu, jarak, ETA, status risiko yang jujur, freshness data, tujuan, serta konfirmasi dua ketuk untuk mengakhiri navigasi.
- Menambahkan gesture-aware free-pan. Camera follow berhenti ketika peta digeser dan kontrol recenter menjadi lebih menonjol; recenter menggunakan transisi halus.
- Menambahkan off-route detection berbasis jarak + persistensi tiga pembacaan agar satu titik GPS noisy tidak langsung memicu rerouting.
- Menambahkan state rerouting tanpa modal. Kegagalan routing masuk ke mode direction-only dan tidak menyebut garis lurus sebagai rute jalan atau rute aman.
- Menjaga geometry route yang sudah tersedia saat koneksi turun. Navigasi offline tetap menampilkan posisi, progress perkiraan, tujuan, serta penjelasan bahwa route baru belum dapat dihitung.
- Menambahkan hazard zone di sekitar route, warning ringkas dengan umur data, dan label stale ketika informasi mungkin sudah berubah.
- Menambahkan layout khusus mobile kecil, landscape, tablet, desktop, safe-area, light mode, serta `prefers-reduced-motion`.

## Kejujuran capability

- Profil jalan kaki tidak dipalsukan jika provider publik yang tersedia hanya mendukung kendaraan. Dalam kondisi tersebut UI memakai **ARAH TUJUAN** dan menjelaskan bahwa garis bukan jalan yang dapat dilalui.
- Nama jalan, maneuver, lane guidance, status fasilitas, dan status risiko tidak dibuat-buat ketika provider tidak menyediakannya.
- Status tujuan yang belum diverifikasi tetap terlihat selama preview dan navigasi.
- GPS stale berhenti bergerak seolah-olah real-time.

## Verifikasi

- Regression test mencakup progress/snap visual, separasi raw GPS, bearing `359° → 0°`, state transitions, free-pan/recenter, GPS noisy/weak/stale, off-route persistence, arrival, maneuver, OSRM alternatives, direction-only fallback, offline navigation, responsive 320 px/landscape, cached-map unavailable, dan reduced motion.
- Browser QA mencakup route preview, navigasi simulasi, progress/ETA, panel compact/expanded, konfirmasi akhir dua ketuk, light mode, dan console aplikasi.
- Portable bundle tetap dijalankan lewat launcher Windows, Linux, atau macOS tanpa Node.js/npm pada komputer pengguna.

## Catatan penggunaan

- GPS nyata memerlukan izin lokasi browser dan diuji oleh aplikasi melalui `watchPosition()`.
- `?demo-nav=1` hanya untuk demonstrasi gerak; jangan digunakan untuk pelaporan insiden nyata.
- Map tiles, rerouting, dan route baru tetap bergantung pada ketersediaan sumber jaringan kecuali sudah berada di cache.
