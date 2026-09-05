import type { MapRouteSummary, TravelMode } from "./types";

export type RouteCoordinate = [number, number];

export function haversineMeters(from: RouteCoordinate, to: RouteCoordinate) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const startLatitude = toRadians(from[1]);
  const endLatitude = toRadians(to[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatRouteDistance(meters: number) {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1).replace(".", ",")} km`;
}

export function formatRouteDuration(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))} menit`;
}

export function providerSupportsMode(mode: TravelMode) {
  // The public OSRM endpoint configured by nuRESQ exposes the driving profile.
  return mode === "driving";
}

export function directionOnlyFallback(
  from: RouteCoordinate,
  to: RouteCoordinate,
  travelMode: TravelMode,
  now = new Date(),
): MapRouteSummary {
  const distanceMeters = haversineMeters(from, to);
  const fallbackSpeedMps = travelMode === "walking" ? 1.3 : 7.5;
  const durationSeconds = distanceMeters / fallbackSpeedMps;
  return {
    id: "direction-only",
    coordinates: [from, to],
    alternatives: [],
    maneuvers: [{
      id: "direction-destination",
      kind: "destination",
      instruction: "Lanjut menuju tujuan",
      streetName: null,
      distanceMeters,
      routeDistanceFromStart: distanceMeters,
      coordinate: to,
    }],
    distanceMeters,
    durationSeconds,
    distanceLabel: formatRouteDistance(distanceMeters),
    durationLabel: formatRouteDuration(durationSeconds),
    nextInstruction: travelMode === "walking"
      ? "Rute jalan kaki belum tersedia penuh — hanya arah tujuan"
      : "Layanan navigasi jalan tidak tersedia — hanya arah tujuan",
    mode: "direction",
    travelMode,
    provider: "direction-only",
    retrievedAt: now.toISOString(),
    freshness: "FRESH",
  };
}
