# nuRESQ Navigation GMaps-Class V2 — Source Revision

> Revision navigasi v2 tersedia di source ini. Baca `NAVIGATION_CHANGELOG.md` untuk arsitektur camera/tracking baru, state machine, map matching confidence, dan hasil validasi.

# nuRESQ

nuRESQ adalah PWA respons darurat citizen-only dengan peta nyata, laporan SOS lokal, asesmen keselamatan deterministik, panduan offline, dan portable build tanpa instalasi runtime.

## Cara tercepat menjalankan

Gunakan hasil `portable-dist`:

- Windows: `BUKA-nuRESQ-Windows.cmd`
- Linux: `BUKA-nuRESQ-Linux.sh`
- macOS: `BUKA-nuRESQ-macOS.command`
- Fallback satu file: `nuRESQ.html`

Pengguna portable tidak memerlukan npm, Node.js, atau proses instalasi. Launcher localhost memberi dukungan service worker, GPS, PWA, dan cache yang lebih lengkap; mode satu-file tetap tersedia jika server lokal tidak dapat dijalankan.

## Capability yang jujur

- SOS disimpan di IndexedDB dengan status `LOCAL_SAVED`.
- Belum ada backend pengiriman; aplikasi tidak mengarang ACK, penerimaan posko, atau responder.
- Pusat awal peta Kota Malang hanya area tampilan dan tidak pernah dianggap lokasi korban.
- Cuaca BMKG memerlukan ADM4 yang dipilih eksplisit di Akun → Wilayah Aktif.
- OSRM publik yang dipakai hanya profil kendaraan. Jalan kaki ditampilkan sebagai arah tujuan, bukan rute aman.
- Scan luka bukan diagnosis dan hanya menaikkan prioritas dari tanda bahaya yang dikonfirmasi manusia.

## Pengembangan source

Toolchain source memakai Node.js untuk membangun artefak, tetapi hasil portable tidak memerlukan toolchain tersebut.

```bash
npm test
bash scripts/build-portable.sh
```

Lihat [CHANGELOG-SAFETY-CORE.md](CHANGELOG-SAFETY-CORE.md) untuk rincian revisi dan batas capability.
