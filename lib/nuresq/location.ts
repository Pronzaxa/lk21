import type { LocationFreshness, LocationSnapshot, LocationTrustMode } from "./types";

export const MAP_DEFAULT_CENTER = { latitude: -7.9786, longitude: 112.6308, label: "Kota Malang" } as const;

export interface RawLocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

const MAX_PLAUSIBLE_SPEED_MPS = 70;

export function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = degreesToRadians(latitudeB - latitudeA);
  const longitudeDelta = degreesToRadians(longitudeB - longitudeA);
  const startLatitude = degreesToRadians(latitudeA);
  const endLatitude = degreesToRadians(latitudeB);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(value: number) {
  return value * (Math.PI / 180);
}

export function isImplausibleJump(previous: RawLocationFix, next: RawLocationFix) {
  const elapsedSeconds = (next.timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds <= 0 || elapsedSeconds > 60 * 60) return false;
  const distance = distanceMeters(previous.latitude, previous.longitude, next.latitude, next.longitude);
  return distance / elapsedSeconds > MAX_PLAUSIBLE_SPEED_MPS;
}

export function locationFreshness(timestamp: number, now = Date.now()): LocationFreshness {
  const age = Math.max(0, now - timestamp);
  if (age < 2 * 60_000) return "FRESH";
  if (age < 10 * 60_000) return "AGING";
  if (age < 30 * 60_000) return "STALE";
  return "VERY_STALE";
}

export function classifyLocationFix(next: RawLocationFix, previous?: RawLocationFix | null, now = Date.now()): LocationTrustMode {
  if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return "GPS_UNAVAILABLE";
  if (previous && isImplausibleJump(previous, next)) return "GPS_SUSPICIOUS";
  if (!Number.isFinite(next.accuracy) || next.accuracy > 100) return "GPS_LOW_ACCURACY";
  if (locationFreshness(next.timestamp, now) === "VERY_STALE") return "GPS_STALE";
  return "GPS_TRUSTED";
}

export function locationLabel(latitude: number, longitude: number) {
  const nearMalang = latitude >= -8.08 && latitude <= -7.87 && longitude >= 112.52 && longitude <= 112.75;
  const nearSurabaya = latitude >= -7.42 && latitude <= -7.12 && longitude >= 112.55 && longitude <= 112.9;
  const nearJakarta = latitude >= -6.4 && latitude <= -6.05 && longitude >= 106.65 && longitude <= 107.0;
  if (nearMalang) return "Malang, Jawa Timur";
  if (nearSurabaya) return "Surabaya, Jawa Timur";
  if (nearJakarta) return "Jakarta";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function createLocationSnapshot(fix: RawLocationFix, mode: LocationTrustMode, now = Date.now()): LocationSnapshot {
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    heading: fix.heading ?? null,
    speed: fix.speed ?? null,
    updatedAt: fix.timestamp,
    mode,
    label: locationLabel(fix.latitude, fix.longitude),
    freshness: locationFreshness(fix.timestamp, now),
    ageMs: Math.max(0, now - fix.timestamp),
  };
}

export function ageCopy(ageMs: number) {
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam ${minutes % 60} menit lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export function locationTrustCopy(mode: LocationTrustMode, freshness?: LocationFreshness, ageMs = 0) {
  if (freshness === "VERY_STALE" || mode === "GPS_STALE") {
    return { label: "Lokasi sangat lama", detail: `Lokasi terakhir berusia ${ageCopy(ageMs)}`, tone: "danger" };
  }
  if (freshness === "STALE") {
    return { label: "Lokasi lama", detail: `Diperbarui ${ageCopy(ageMs)}`, tone: "warning" };
  }
  if (freshness === "AGING") {
    return { label: "Lokasi menua", detail: `Diperbarui ${ageCopy(ageMs)}`, tone: "warning" };
  }
  switch (mode) {
    case "GPS_TRUSTED":
      return { label: "GPS tepercaya", detail: `Diperbarui ${ageCopy(ageMs)}`, tone: "trusted" };
    case "GPS_LOW_ACCURACY":
      return { label: "Akurasi rendah", detail: `GPS tersedia tetapi akurasinya rendah · ${ageCopy(ageMs)}`, tone: "warning" };
    case "LAST_TRUSTED":
      return { label: "Lokasi terakhir", detail: `Diperbarui ${ageCopy(ageMs)}`, tone: "warning" };
    case "GPS_SUSPICIOUS":
      return { label: "Lokasi GPS mencurigakan", detail: "Perubahan lokasi tidak wajar; memakai lokasi valid terakhir", tone: "danger" };
    case "GPS_REQUESTING":
      return { label: "Memeriksa lokasi", detail: "Menunggu GPS perangkat", tone: "neutral" };
    default:
      return { label: "Lokasi belum tersedia", detail: "Belum ada koordinat perangkat yang dapat dipercaya", tone: "danger" };
  }
}
