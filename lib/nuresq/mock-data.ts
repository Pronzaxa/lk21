import type { Destination } from "./types";

export const destinations: Destination[] = [
  {
    id: "alun-alun-malang",
    name: "Alun-Alun Kota Malang",
    kind: "post",
    latitude: -7.98264,
    longitude: 112.63078,
    distance: "Menghitung",
    eta: "—",
    capacity: "Titik referensi · belum diverifikasi",
    safe: true,
    note: "Periksa informasi resmi sebelum berangkat",
  },
  {
    id: "rs-saiful-anwar",
    name: "RSUD Dr. Saiful Anwar",
    kind: "hospital",
    latitude: -7.97215,
    longitude: 112.63195,
    distance: "Menghitung",
    eta: "—",
    capacity: "Fasilitas kesehatan · belum diverifikasi",
    safe: true,
    note: "Status layanan perlu dikonfirmasi",
  },
  {
    id: "stadion-gajayana",
    name: "Stadion Gajayana",
    kind: "shelter",
    latitude: -7.97503,
    longitude: 112.62156,
    distance: "Menghitung",
    eta: "—",
    capacity: "Area terbuka · bukan shelter terverifikasi",
    safe: true,
    note: "Gunakan hanya jika diarahkan petugas",
  },
];

export const incidentTypes = [
  "Banjir",
  "Gempa",
  "Longsor",
  "Kebakaran",
  "Darurat Medis",
  "Lainnya",
] as const;
