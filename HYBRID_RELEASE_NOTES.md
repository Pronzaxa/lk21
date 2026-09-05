# nuRESQ Hybrid Local AI — development foundation

Model aktif: SmolLM2-135M-Instruct-Q3_K_M.gguf milik pengguna, 93.510.496 byte. Runtime lokal memakai llama-cpp-python di localhost:8790.

## Menjalankan

1. Dari SOURCE-CODE, pasang `local-ai/requirements.txt`, lalu jalankan `local-ai/START-SMOLLM2-WINDOWS.cmd`. Setelah itu jalankan PORTABLE/BUKA-nuRESQ-Windows.cmd. Tanpa server GGUF, aplikasi tetap memakai parser dasar.
2. Backend opsional: pasang Node.js 22.16+ (SQLite bawaan masih eksperimental pada Node 22), lalu jalankan SOURCE-CODE/backend/START-BACKEND.bat. Ikuti BACKEND.md untuk konfigurasi production. Tidak ada cloud LLM atau responder otomatis.
3. Atur PORTABLE/app/nuresq-config.js untuk AUTO / FORCE_OFFLINE / FORCE_ONLINE dan backendUrl. FORCE_ONLINE tetap memerlukan health check nyata. Default backend 127.0.0.1:8787, frontend 4173. Jika launcher memakai port lain, sesuaikan CORS_ORIGINS backend.
4. Akun → Perangkat Ini menunjukkan kesiapan model sebenarnya. Tunggu persiapan pertama; parser dasar tetap dapat digunakan.

## Batas yang penting

- Build ini belum layak untuk triase darurat nyata: lima cacat Safety Core lama direproduksi dalam BLOCKING_SAFETY_CORE_ISSUES.md. Core sengaja tidak diubah diam-diam.
- SmolLM2 belum fine-tuned untuk triase insiden. Output generatif dibatasi JSON dan divalidasi; evaluasi keselamatan operasional belum tersedia. Panduan perlu review ahli.
- Selesai/batal adalah lifecycle lokal. Antrean berhenti untuk laporan tertutup tanpa menghapus riwayat. Permintaan yang sudah terbang atau diterima server tidak dapat ditarik kembali; belum ada pembatalan penanganan responder.
- Laporan lama sebelum outbox v3 tetap tersimpan, tetapi tidak otomatis dibackfill ke backend. Tidak ada pengiriman diam-diam terhadap riwayat lama.
- Cache browser dapat dihapus OS/browser. Gunakan origin/port yang sama untuk mempertahankan IndexedDB. Jangan menghapus data situs ketika masih ada SOS tertunda.
- Backend menyediakan penyimpanan dan ACK, bukan bukti petugas membaca atau bergerak. Token per perangkat membatasi akses antarperangkat, bukan autentikasi identitas terverifikasi. Production memerlukan TLS, kontrol akses operator, audit dan kebijakan privasi.
- FORCE_OFFLINE berlaku pada pipeline hybrid; fitur peta/hazard publik yang sudah ada memiliki mekanisme koneksi sendiri.

Lihat HYBRID_AI_ARCHITECTURE.md untuk alur, LOCAL_AI.md untuk model, CONFIGURATION.md untuk konfigurasi, serta HYBRID_REGRESSION_REPORT.md untuk hasil verifikasi terbaru. REGRESSION_REPORT.md lama adalah catatan historis, bukan hasil build ini.
