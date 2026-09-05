# nuRESQ Safety & Offline Core — Hardened

## Perubahan utama

- Parser keselamatan kini memisahkan kondisi positif, negasi, riwayat, pemulihan, dan tidak diketahui. Kalimat seperti “tidak pingsan”, “tidak ada perdarahan”, dan “air tidak naik” tidak lagi menaikkan risiko.
- Jumlah korban hanya diisi dari bukti eksplisit. Penyebutan anggota keluarga saja tidak lagi dianggap sebagai korban tambahan.
- Pusat awal peta dipisahkan dari lokasi pengguna. Tanpa GPS atau last-trusted location, koordinat korban tetap `null` dan marker pengguna tidak ditampilkan.
- Lokasi memiliki status trust dan freshness (`FRESH`, `AGING`, `STALE`, `VERY_STALE`) beserta usia yang terlihat di UI.
- Cuaca BMKG tidak lagi memakai Lowokwaru secara diam-diam. ADM4 harus dipilih secara eksplisit di Akun → Wilayah Aktif.
- Setiap feed risiko dan hasil rute menyimpan sumber, waktu pengambilan, serta freshness. Cache lama diberi label sebagai data lama.
- Mode Jalan Kaki dan Kendaraan dipisahkan. Endpoint OSRM publik hanya digunakan untuk kendaraan; mode jalan kaki memakai “Arah tujuan” dan tidak diklaim sebagai rute jalan.
- Connectivity Manager memverifikasi endpoint publik. `navigator.onLine` hanya menjadi salah satu sinyal, bukan bukti bahwa layanan nuRESQ dapat dijangkau.
- Catatan SOS, queue, last-trusted location, dan kontak darurat dipindahkan ke IndexedDB melalui `EmergencyRepository`.
- Koneksi kembali tidak menghapus queue dan tidak menghasilkan ACK palsu. Status `ACKNOWLEDGED` hanya dapat diberikan dengan ID dan timestamp ACK nyata.
- Service worker memisahkan `APP_CACHE`, `TILE_CACHE`, `ROUTE_CACHE`, dan `DATA_CACHE`, masing-masing dengan limit dan TTL terpisah.
- Akun memiliki checklist Kesiapan Darurat dan status storage persistence berdasarkan capability nyata perangkat.
- Dikte suara offline diberi label belum tersedia. Scan luka tetap berupa quality check + visual hint + konfirmasi manusia dan bukan diagnosis medis.

## Verifikasi

- Regression tests: negasi, temporal/recovery, jumlah korban, lokasi, queue/ACK, connectivity, routing, cache, portable build, map, theme, dan rendered UI.
- Portable launcher Windows, Linux, macOS, localhost mode, dan single-file fallback tetap tidak memerlukan npm atau Node.js saat digunakan.

## Batas capability saat ini

- Belum ada backend produksi atau pengiriman otomatis ke posko/responder.
- Belum ada Local AI, speech-to-text offline terverifikasi, VLM, mesh, LoRa, atau data shelter terverifikasi.
- Rute jalan kaki penuh belum tersedia dari provider yang dikonfigurasi; UI hanya menampilkan arah tujuan.
