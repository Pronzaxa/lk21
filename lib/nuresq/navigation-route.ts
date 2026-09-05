import { dataFreshness } from "./freshness";
import { maneuverKind } from "./navigation";
import { formatRouteDistance, formatRouteDuration } from "./routing";
import type { MapRouteSummary, NavigationManeuver, NavigationRouteOption, TravelMode } from "./types";

export interface OsrmStepPayload {
  distance: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
    exit?: number;
  };
}

export interface OsrmRoutePayload {
  distance: number;
  duration: number;
  geometry: { coordinates: Array<[number, number]>; type: "LineString" };
  legs?: Array<{ steps?: OsrmStepPayload[] }>;
}

export interface OsrmResponsePayload {
  code: string;
  routes?: OsrmRoutePayload[];
}

function instructionFor(step: OsrmStepPayload) {
  const type = step.maneuver?.type;
  const modifier = step.maneuver?.modifier;
  const street = step.name?.trim();
  const suffix = street ? ` ke ${street}` : "";
  if (type === "arrive") return "Tujuan berada di depan";
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") {
    const exit = step.maneuver?.exit;
    return exit ? `Ambil pintu keluar ke-${exit}${suffix}` : `Masuk bundaran${suffix}`;
  }
  if (modifier === "uturn") return `Putar balik${suffix}`;
  if (modifier === "sharp left") return `Belok tajam ke kiri${suffix}`;
  if (modifier === "slight left") return `Ambil sedikit ke kiri${suffix}`;
  if (modifier === "left") return `Belok kiri${suffix}`;
  if (modifier === "sharp right") return `Belok tajam ke kanan${suffix}`;
  if (modifier === "slight right") return `Ambil sedikit ke kanan${suffix}`;
  if (modifier === "right") return `Belok kanan${suffix}`;
  if (street) return `Lanjut di ${street}`;
  return "Lanjut mengikuti rute";
}

export function parseOsrmManeuvers(steps: OsrmStepPayload[] = []): NavigationManeuver[] {
  let cumulativeDistance = 0;
  return steps.map((step, index) => {
    const maneuver: NavigationManeuver = {
      id: `maneuver-${index}`,
      kind: maneuverKind(step.maneuver?.type, step.maneuver?.modifier),
      instruction: instructionFor(step),
      streetName: step.name?.trim() || null,
      distanceMeters: step.distance,
      routeDistanceFromStart: cumulativeDistance,
      coordinate: step.maneuver?.location ?? null,
    };
    cumulativeDistance += Math.max(0, step.distance);
    return maneuver;
  });
}

export function parseOsrmRoutes(payload: OsrmResponsePayload): NavigationRouteOption[] {
  if (payload.code !== "Ok" || !payload.routes?.length) return [];
  return payload.routes.slice(0, 3).flatMap((route, index) => {
    if (!route.geometry?.coordinates?.length || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return [];
    return [{
      id: `osrm-route-${index}`,
      coordinates: route.geometry.coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      distanceLabel: formatRouteDistance(route.distance),
      durationLabel: formatRouteDuration(route.duration),
      maneuvers: parseOsrmManeuvers(route.legs?.flatMap((leg) => leg.steps ?? []) ?? []),
    }];
  });
}

export function routeSummaryFromOption(
  option: NavigationRouteOption,
  allOptions: NavigationRouteOption[],
  retrievedAt: string,
  travelMode: TravelMode,
): MapRouteSummary {
  const firstInstruction = option.maneuvers.find((maneuver) => maneuver.kind !== "straight")?.instruction
    ?? option.maneuvers[0]?.instruction
    ?? "Lanjut mengikuti rute";
  return {
    id: option.id,
    coordinates: option.coordinates,
    alternatives: allOptions,
    maneuvers: option.maneuvers,
    distanceMeters: option.distanceMeters,
    durationSeconds: option.durationSeconds,
    distanceLabel: option.distanceLabel,
    durationLabel: option.durationLabel,
    nextInstruction: firstInstruction,
    mode: "road",
    travelMode,
    provider: "osrm-driving",
    retrievedAt,
    freshness: dataFreshness(retrievedAt),
  };
}
