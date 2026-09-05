import { emergencyGuides } from "./assistant-emergency";
export const fieldGuides = [
  ...emergencyGuides,
  {
    id: "prepare-sos",
    title: "Sebelum mengirim SOS",
    summary: "Pastikan laporan singkat tetapi dapat ditindaklanjuti.",
    steps: [
      "Menjauh dari ancaman langsung bila Anda dapat bergerak dengan aman.",
      "Sebutkan jenis kejadian, jumlah orang, dan hambatan mobilitas.",
      "Perbarui lokasi atau sebutkan patokan terdekat bila GPS meragukan.",
    ],
  },
  {
    id: "offline",
    title: "Saat internet mati",
    summary: "Laporan tetap dibuat dan disimpan di perangkat.",
    steps: [
      "Simpan satu laporan SOS dan tunggu tanda bahwa laporan tersimpan.",
      "Jangan menghapus data situs atau membuat laporan berulang untuk kejadian yang sama.",
      "Saat koneksi kembali, periksa status melalui Asisten → Responder. Laporan tidak dianggap terkirim tanpa konfirmasi nyata.",
    ],
  },
  {
    id: "location",
    title: "Jika lokasi meragukan",
    summary: "Gunakan posisi valid terakhir dan tambahkan patokan.",
    steps: [
      "Ketuk Perbarui pada bagian Lokasi Saya.",
      "Bergerak ke area lebih terbuka hanya bila kondisi sekitar aman.",
      "Tambahkan nama jalan, bangunan, jembatan, atau penanda pada ringkasan laporan.",
    ],
  },
  {
    id: "waiting",
    title: "Saat menunggu bantuan",
    summary: "Jaga komunikasi dan posisi tetap mudah ditemukan.",
    steps: [
      "Pantau kanal resmi yang Anda gunakan untuk meminta bantuan.",
      "Hemat baterai dan pertahankan ponsel tetap menyala.",
      "Laporkan perubahan kondisi penting tanpa membuat SOS baru.",
    ],
  },
] as const;
