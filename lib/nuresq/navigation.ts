import { haversineMeters, type RouteCoordinate } from "./routing";
import type {
  LiveHazardAlert,
  ManeuverKind,
  NavigationCameraMode,
  NavigationManeuver,
  NavigationProgress,
  TravelMode,
} from "./types";

const METERS_PER_LATITUDE_DEGREE = 110_540;
const MIN_ROUTE_COORDINATES = 2;

export interface OffRouteTracker {
  consecutiveOutside: number;
  offRoute: boolean;
}

export interface NavigationCameraPlan {
  center: RouteCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
  offset: [number, number];
  duration: number;
}

export interface RouteHazardMatch {
  alert: LiveHazardAlert;
  distanceFromRouteMeters: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function localPoint(coordinate: RouteCoordinate, referenceLatitude: number) {
  const longitudeScale = 111_320 * Math.cos(referenceLatitude * Math.PI / 180);
  return {
    x: coordinate[0] * longitudeScale,
    y: coordinate[1] * METERS_PER_LATITUDE_DEGREE,
  };
}

function interpolateCoordinate(from: RouteCoordinate, to: RouteCoordinate, fraction: number): RouteCoordinate {
  return [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
  ];
}

export function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

export function shortestBearingTarget(previousContinuous: number, nextBearing: number) {
  const previousNormalized = normalizeBearing(previousContinuous);
  const nextNormalized = normalizeBearing(nextBearing);
  let delta = nextNormalized - previousNormalized;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return previousContinuous + delta;
}

export function bearingBetween(from: RouteCoordinate, to: RouteCoordinate) {
  const fromLatitude = from[1] * Math.PI / 180;
  const toLatitude = to[1] * Math.PI / 180;
  const longitudeDelta = (to[0] - from[0]) * Math.PI / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return normalizeBearing(Math.atan2(y, x) * 180 / Math.PI);
}

export function calculateRouteProgress(
  rawLocation: RouteCoordinate,
  coordinates: RouteCoordinate[],
  routeDistanceMeters: number,
  routeDurationSeconds: number,
): NavigationProgress | null {
  if (coordinates.length < MIN_ROUTE_COORDINATES) return null;

  const segmentLengths = coordinates.slice(1).map((coordinate, index) => (
    haversineMeters(coordinates[index], coordinate)
  ));
  const geometryLength = segmentLengths.reduce((sum, distance) => sum + distance, 0);
  if (geometryLength <= 0) return null;

  let travelledGeometryMeters = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSegment = 0;
  let bestCoordinate = coordinates[0];
  let accumulated = 0;

  coordinates.slice(1).forEach((end, index) => {
    const start = coordinates[index];
    const referenceLatitude = (start[1] + end[1] + rawLocation[1]) / 3;
    const startPoint = localPoint(start, referenceLatitude);
    const endPoint = localPoint(end, referenceLatitude);
    const locationPoint = localPoint(rawLocation, referenceLatitude);
    const deltaX = endPoint.x - startPoint.x;
    const deltaY = endPoint.y - startPoint.y;
    const squaredLength = deltaX * deltaX + deltaY * deltaY;
    const fraction = squaredLength === 0
      ? 0
      : clamp(((locationPoint.x - startPoint.x) * deltaX + (locationPoint.y - startPoint.y) * deltaY) / squaredLength, 0, 1);
    const projectedX = startPoint.x + deltaX * fraction;
    const projectedY = startPoint.y + deltaY * fraction;
    const distance = Math.hypot(locationPoint.x - projectedX, locationPoint.y - projectedY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = index;
      bestCoordinate = interpolateCoordinate(start, end, fraction);
      travelledGeometryMeters = accumulated + segmentLengths[index] * fraction;
    }
    accumulated += segmentLengths[index];
  });

  const fraction = clamp(travelledGeometryMeters / geometryLength, 0, 1);
  const travelledDistanceMeters = routeDistanceMeters * fraction;
  const remainingDistanceMeters = Math.max(0, routeDistanceMeters - travelledDistanceMeters);
  const remainingDurationSeconds = Math.max(0, routeDurationSeconds * (1 - fraction));
  const travelledCoordinates = [
    ...coordinates.slice(0, bestSegment + 1),
    bestCoordinate,
  ];
  const remainingCoordinates = [
    bestCoordinate,
    ...coordinates.slice(bestSegment + 1),
  ];

  return {
    fraction,
    distanceFromRouteMeters: bestDistance,
    travelledDistanceMeters,
    remainingDistanceMeters,
    remainingDurationSeconds,
    visualCoordinate: bestCoordinate,
    travelledCoordinates,
    remainingCoordinates,
  };
}

export function updateOffRouteTracker(
  previous: OffRouteTracker,
  distanceFromRouteMeters: number,
  travelMode: TravelMode,
  accuracyMeters = 12,
  movingAwayFromRoute = true,
): OffRouteTracker {
  const threshold = travelMode === "walking" ? 42 : 68;
  const recoveryThreshold = threshold * 0.62;
  const maximumReliableAccuracy = travelMode === "walking" ? 38 : 58;

  // Poor fixes are not evidence of deviation. Keep navigation calm until GPS is trustworthy.
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > maximumReliableAccuracy) return previous;
  if (distanceFromRouteMeters <= recoveryThreshold) return { consecutiveOutside: 0, offRoute: false };
  if (distanceFromRouteMeters <= threshold || !movingAwayFromRoute) {
    return previous.offRoute ? previous : { consecutiveOutside: 0, offRoute: false };
  }
  const consecutiveOutside = previous.consecutiveOutside + 1;
  return { consecutiveOutside, offRoute: consecutiveOutside >= 3 };
}

export function arrivalState(remainingDistanceMeters: number, travelMode: TravelMode) {
  const arrivedThreshold = travelMode === "walking" ? 22 : 38;
  const arrivingThreshold = travelMode === "walking" ? 95 : 145;
  if (remainingDistanceMeters <= arrivedThreshold) return "ARRIVED" as const;
  if (remainingDistanceMeters <= arrivingThreshold) return "ARRIVING" as const;
  return null;
}

export function currentManeuver(
  maneuvers: NavigationManeuver[],
  travelledDistanceMeters: number,
) {
  if (!maneuvers.length) return null;
  const nextIndex = maneuvers.findIndex((maneuver) => maneuver.routeDistanceFromStart >= travelledDistanceMeters - 8);
  const index = nextIndex === -1 ? maneuvers.length - 1 : nextIndex;
  const maneuver = maneuvers[index];
  return {
    maneuver,
    next: maneuvers[index + 1] ?? null,
    distanceMeters: Math.max(0, maneuver.routeDistanceFromStart - travelledDistanceMeters),
  };
}

export function maneuverDistanceCopy(distanceMeters: number) {
  if (distanceMeters <= 18) return "Belok sekarang";
  if (distanceMeters < 100) return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`;
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters / 50) * 50} m`;
  return `${(distanceMeters / 1_000).toFixed(1).replace(".", ",")} km`;
}

export function maneuverKind(type?: string, modifier?: string): ManeuverKind {
  if (type === "arrive") return "destination";
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return "roundabout";
  if (modifier === "uturn") return "u-turn";
  if (modifier === "sharp left") return "sharp-left";
  if (modifier === "slight left") return "slight-left";
  if (modifier === "left") return "left";
  if (modifier === "sharp right") return "sharp-right";
  if (modifier === "slight right") return "slight-right";
  if (modifier === "right") return "right";
  return "straight";
}

export function cameraPlan({
  coordinate,
  heading,
  speedMps,
  maneuverDistanceMeters,
  cameraMode,
  travelMode,
  viewportHeight,
  reducedMotion,
}: {
  coordinate: RouteCoordinate;
  heading: number | null;
  speedMps: number | null;
  maneuverDistanceMeters: number | null;
  cameraMode: NavigationCameraMode;
  travelMode: TravelMode;
  viewportHeight: number;
  reducedMotion: boolean;
}): NavigationCameraPlan {
  const speed = Math.max(0, speedMps ?? 0);
  let zoom = travelMode === "walking" ? 17.1 : 16.1;
  if (travelMode === "driving" && speed > 17) zoom = 14.7;
  else if (travelMode === "driving" && speed > 9) zoom = 15.3;
  if (maneuverDistanceMeters !== null && maneuverDistanceMeters < 180) zoom += 0.45;
  if (cameraMode === "OVERVIEW") zoom = 13.4;
  const headingUp = cameraMode === "FOLLOW" && heading !== null;
  return {
    center: coordinate,
    zoom,
    bearing: headingUp ? normalizeBearing(heading) : 0,
    pitch: cameraMode === "OVERVIEW" ? 8 : travelMode === "walking" ? 36 : 46,
    offset: cameraMode === "OVERVIEW" ? [0, 0] : [0, Math.round(viewportHeight * 0.16)],
    duration: reducedMotion ? 0 : 560,
  };
}

export function pointDistanceFromRoute(point: RouteCoordinate, route: RouteCoordinate[]) {
  const progress = calculateRouteProgress(point, route, 1, 1);
  return progress?.distanceFromRouteMeters ?? Number.POSITIVE_INFINITY;
}

export function nearestRouteHazard(
  hazards: LiveHazardAlert[],
  remainingRoute: RouteCoordinate[],
  maximumDistanceMeters = 450,
): RouteHazardMatch | null {
  if (remainingRoute.length < MIN_ROUTE_COORDINATES) return null;
  const matches = hazards.flatMap((alert) => {
    if (!Number.isFinite(alert.latitude) || !Number.isFinite(alert.longitude)) return [];
    const distanceFromRouteMeters = pointDistanceFromRoute([alert.longitude!, alert.latitude!], remainingRoute);
    return distanceFromRouteMeters <= maximumDistanceMeters ? [{ alert, distanceFromRouteMeters }] : [];
  });
  return matches.sort((a, b) => a.distanceFromRouteMeters - b.distanceFromRouteMeters)[0] ?? null;
}

export function estimatedArrivalTime(remainingDurationSeconds: number, now = new Date()) {
  return new Date(now.getTime() + remainingDurationSeconds * 1_000).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function interpolateNavigationCoordinate(
  from: RouteCoordinate,
  to: RouteCoordinate,
  progress: number,
) {
  return interpolateCoordinate(from, to, clamp(progress, 0, 1));
}


export function coordinateAtDistanceAlongRoute(coordinates: RouteCoordinate[], distanceMeters: number) {
  if (!coordinates.length) return null;
  if (coordinates.length === 1 || distanceMeters <= 0) return coordinates[0];
  let remaining = distanceMeters;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const from = coordinates[index];
    const to = coordinates[index + 1];
    const length = haversineMeters(from, to);
    if (remaining <= length || index === coordinates.length - 2) {
      const fraction = length <= 0 ? 0 : clamp(remaining / length, 0, 1);
      return interpolateCoordinate(from, to, fraction);
    }
    remaining -= length;
  }
  return coordinates.at(-1) ?? null;
}

export function coordinateAtRouteFraction(coordinates: RouteCoordinate[], fraction: number) {
  if (!coordinates.length) return null;
  if (coordinates.length === 1) return coordinates[0];
  const lengths = coordinates.slice(1).map((coordinate, index) => haversineMeters(coordinates[index], coordinate));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return coordinates[0];
  const target = clamp(fraction, 0, 1) * total;
  let accumulated = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const next = accumulated + lengths[index];
    if (target <= next || index === lengths.length - 1) {
      const segmentFraction = lengths[index] === 0 ? 0 : (target - accumulated) / lengths[index];
      return interpolateCoordinate(coordinates[index], coordinates[index + 1], segmentFraction);
    }
    accumulated = next;
  }
  return coordinates.at(-1) ?? null;
}
