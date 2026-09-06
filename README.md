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

- SOS selalu disimpan lebih dulu di IndexedDB. Saat backend terjangkau, laporan menerima ACK server nyata; aplikasi tetap tidak mengarang penerimaan responder.
- Backend opsional menyediakan Rescue Coordinator berbasis job SQLite. Provider lokal dan Hermes dibedakan secara eksplisit, dan kegagalan agent tidak membatalkan ACK SOS.
- Pusat awal peta Kota Malang hanya area tampilan dan tidak pernah dianggap lokasi korban.
- Cuaca BMKG memerlukan ADM4 yang dipilih eksplisit di Akun → Wilayah Aktif.
- OSRM publik yang dipakai hanya profil kendaraan. Jalan kaki ditampilkan sebagai arah tujuan, bukan rute aman.
- Scan luka bukan diagnosis dan hanya menaikkan prioritas dari tanda bahaya yang dikonfirmasi manusia.

## Pengembangan source

Toolchain source memakai Node.js untuk membangun artefak, tetapi hasil portable tidak memerlukan toolchain tersebut.

```bash
npm test
bash scripts/build-portable.sh
cd backend && npm test
```

Lihat [CHANGELOG-SAFETY-CORE.md](CHANGELOG-SAFETY-CORE.md) untuk rincian revisi dan batas capability.
Lihat [RESCUE_COORDINATOR_ARCHITECTURE.md](RESCUE_COORDINATOR_ARCHITECTURE.md) dan [README_HERMES_DEPLOY.md](README_HERMES_DEPLOY.md) untuk coordinator dan deployment backend.
