/** Offline guidance. References: ready.gov; redcross.org first-aid resources. */
export const emergencyGuides = [
  { id: "banjir", title: "Banjir", summary: "Hindari arus dan genangan.", steps: ["Jika jalurnya aman, pindah ke tempat lebih tinggi. Jangan berjalan atau berkendara melewati air banjir.", "Jika terjebak, cari tempat tinggi yang memiliki jalan keluar dan beri tahu penolong lokasi Anda."], question: "Apakah air masih naik, berapa orang bersama Anda, dan apakah ada jalan keluar yang aman?" },
  { id: "gempa", title: "Gempa", summary: "Lindungi kepala saat guncangan.", steps: ["Saat masih berguncang di dalam bangunan, merunduk, berlindung di bawah meja kokoh, dan berpegangan. Jauhi kaca; jangan berlari keluar atau memakai lift.", "Jika di luar, jauhi bangunan, tiang, dan kabel. Setelah guncangan berhenti, periksa jalur keluar dan ikuti arahan resmi."], question: "Apakah guncangan masih berlangsung dan apakah Anda berada di dalam bangunan?" },
  { id: "kebakaran", title: "Kebakaran", summary: "Keluar dan tetap di luar.", steps: ["Jika jalur keluar aman, segera keluar; tetap rendah saat melewati asap. Jangan memakai lift atau kembali mengambil barang.", "Jika terjebak, tutup pintu antara Anda dan api, beri sinyal dari jendela, dan hubungi pemadam setempat."], question: "Apakah ada asap, orang terjebak, atau jalur keluar yang terhalang?" },
  { id: "longsor", title: "Longsor", summary: "Jauhi jalur material bergerak.", steps: ["Jika dapat dilakukan dengan aman, menjauh dari lereng dan jalur longsoran. Jangan mendekati material yang masih bergerak.", "Waspadai longsor susulan dan ikuti instruksi evakuasi petugas."], question: "Apakah tanah masih bergerak, ada orang tertimbun, atau akses keluar terputus?" },
  { id: "medis", title: "Darurat medis", summary: "Periksa respons dan napas.", steps: ["Pastikan lingkungan aman. Jika korban tidak merespons, tidak bernapas normal, atau mengalami perdarahan berat, segera hubungi layanan darurat medis setempat.", "Ikuti instruksi operator. Jika korban tidak merespons dan tidak bernapas normal, mulai RJP sesuai panduan operator; gunakan AED bila tersedia. Jangan memberi minum kepada korban tidak sadar."], question: "Apakah korban merespons, bernapas normal, dan mengalami perdarahan berat?" },
] as const;

const patterns = [
  /\b(banjir|air (?:terus |makin |semakin )?naik|air masuk rumah|sungai meluap|terendam)\b/,
  /\b(gempa|bumi bergetar|(?:rumah|lantai|bangunan) (?:bergoyang|bergetar)|guncangan)\b/,
  /\b(kebakaran|terbakar|api (?:membesar|menyebar)|asap (?:tebal|hitam)|bau gas)\b/,
  /\b(longsor|tanah (?:bergerak|retak|turun)|lereng runtuh|tertimbun)\b/,
  /\b(medis|pingsan|tidak sadar|tidak (?:bisa )?bernapas|sesak|darah (?:terus |tidak berhenti )?keluar|perdarahan|nyeri dada|kejang)\b/,
];

export function emergencyResponse(input: string) {
  const text = input.toLowerCase().normalize("NFKC")
    .replace(/\b(gak|nggak|ga|enggak|tdk|tak)\b/g, "tidak")
    .replace(/\b(nafas|napas|bernafas)\b/g, "bernapas")
    .replace(/\b(lg)\b/g, "lagi");
  const clauses = text.split(/[.!?;,]|\b(?:tapi|tetapi|namun)\b/);
  const matches = emergencyGuides.filter((_, index) => clauses.some((clause) => {
    const match = patterns[index].exec(clause);
    if (!match) return false;
    // Negation applies to the matched hazard, not to a later independent clause.
    return !/(?:tidak (?:ada|terjadi)|bukan|tanpa)\s*$/.test(clause.slice(0, match.index));
  }));
  if (!matches.length) return null;
  const educational = /\b(simulasi|latihan|tugas sekolah|apa itu|jika|kalau|seandainya)\b/.test(text)
    && !/\b(sekarang|saat ini|tolong|terjebak|tertimbun)\b/.test(text);
  const historical = /\b(kemarin|minggu lalu|sudah surut|sudah padam|sudah aman)\b/.test(text)
    && !/\b(tapi|tetapi|namun|sekarang|masih)\b/.test(text);
  return {
    hazards: matches.map((guide) => guide.id),
    recommendSos: !educational && !historical,
    source: "Panduan keselamatan offline",
    text: matches.map((guide) => `${guide.title}: ${guide.steps.join(" ")}\n${guide.question}`).join("\n\n")
      + "\nSOS nuRESQ disimpan di perangkat; penerimaan bantuan belum terkonfirmasi. Hubungi layanan darurat setempat jika ada ancaman langsung.",
  };
}
