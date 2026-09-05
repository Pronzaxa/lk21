import type { DataFreshness } from "./types";

export function dataFreshness(retrievedAt: string | number | null | undefined, now = Date.now()): DataFreshness {
  const timestamp = typeof retrievedAt === "number" ? retrievedAt : Date.parse(retrievedAt ?? "");
  if (!Number.isFinite(timestamp)) return "UNKNOWN";
  const age = Math.max(0, now - timestamp);
  if (age < 15 * 60_000) return "FRESH";
  if (age < 60 * 60_000) return "AGING";
  return "STALE";
}

export function freshnessCopy(freshness: DataFreshness, retrievedAt?: string) {
  const ageMs = retrievedAt ? Math.max(0, Date.now() - Date.parse(retrievedAt)) : Number.NaN;
  const minutes = Number.isFinite(ageMs) ? Math.floor(ageMs / 60_000) : null;
  const age = minutes === null
    ? "usia tidak diketahui"
    : minutes < 1
      ? "baru saja"
      : minutes < 60
        ? `${minutes} menit lalu`
        : `${Math.floor(minutes / 60)} jam ${minutes % 60} menit lalu`;
  if (freshness === "STALE") return `Data lama · ${age}`;
  if (freshness === "AGING") return `Diperbarui ${age}`;
  if (freshness === "FRESH") return `Diperbarui ${age}`;
  return "Usia data tidak diketahui";
}
