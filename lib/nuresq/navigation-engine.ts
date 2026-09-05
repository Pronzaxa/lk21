import {
  bearingBetween,
  calculateRouteProgress,
  coordinateAtDistanceAlongRoute,
  interpolateNavigationCoordinate,
  normalizeBearing,
  shortestBearingTarget,
} from "./navigation";
import type {
  LocationSnapshot,
  NavigationCameraMode,
  NavigationGpsQuality,
  NavigationManeuver,
  NavigationProgress,
  NavigationRouteOption,
  NavigationState,
  TravelMode,
} from "./types";
import type { RouteCoordinate } from "./routing";

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export interface NavigationVisualSample {
  coordinate: RouteCoordinate;
  bearing: number | null;
  speedMps: number;
  accuracyMeters: number | null;
  stale: boolean;
}

/**
 * Fix-rate input, frame-rate output. The smoother never mutates safety/trusted GPS data.
 */
export class NavigationLocationSmoother {
  private from: RouteCoordinate | null = null;
  private target: RouteCoordinate | null = null;
  private startedAt = 0;
  private durationMs = 650;
  private continuousBearing: number | null = null;
  private targetBearing: number | null = null;
  private speedMps = 0;
  private accuracyMeters: number | null = null;
  private stale = false;

  pushFix(location: LocationSnapshot, visualTarget: RouteCoordinate, now = performance.now()) {
    const current = this.sample(now)?.coordinate ?? visualTarget;
    this.from = current;
    this.target = visualTarget;
    this.startedAt = now;
    this.durationMs = clamp(location.ageMs > 0 ? 520 : 650, 400, 1_000);
    this.speedMps = Math.max(0, location.speed ?? 0);
    this.accuracyMeters = location.accuracy ?? null;
    this.stale = location.mode === "GPS_STALE" || location.freshness === "VERY_STALE";
    if (Number.isFinite(location.heading)) {
      const heading = normalizeBearing(location.heading!);
      this.targetBearing = this.continuousBearing === null
        ? heading
        : shortestBearingTarget(this.continuousBearing, heading);
      if (this.continuousBearing === null) this.continuousBearing = heading;
    }
  }

  sample(now = performance.now()): NavigationVisualSample | null {
    if (!this.target) return null;
    if (this.stale || !this.from) {
      return {
        coordinate: this.target,
        bearing: this.continuousBearing === null ? null : normalizeBearing(this.continuousBearing),
        speedMps: this.speedMps,
        accuracyMeters: this.accuracyMeters,
        stale: this.stale,
      };
    }
    const t = clamp((now - this.startedAt) / this.durationMs, 0, 1);
    const eased = 1 - (1 - t) ** 3;
    const coordinate = interpolateNavigationCoordinate(this.from, this.target, eased);
    if (this.targetBearing !== null && this.continuousBearing !== null) {
      const bearingAlpha = Math.min(1, eased * 0.72 + 0.08);
      this.continuousBearing += (this.targetBearing - this.continuousBearing) * bearingAlpha;
    }
    return {
      coordinate,
      bearing: this.continuousBearing === null ? null : normalizeBearing(this.continuousBearing),
      speedMps: this.speedMps,
      accuracyMeters: this.accuracyMeters,
      stale: false,
    };
  }
}

export interface RouteProgressResult {
  progress: NavigationProgress | null;
  matchedCoordinate: RouteCoordinate | null;
  matched: boolean;
  confidence: "high" | "medium" | "low";
}

export class RouteProgressTracker {
  private route: NavigationRouteOption | null = null;

  setRoute(route: NavigationRouteOption | null) {
    this.route = route;
  }

  update(location: LocationSnapshot, travelMode: TravelMode): RouteProgressResult {
    if (!this.route) return { progress: null, matchedCoordinate: null, matched: false, confidence: "low" };
    const progress = calculateRouteProgress(
      [location.longitude, location.latitude],
      this.route.coordinates,
      this.route.distanceMeters,
      this.route.durationSeconds,
    );
    if (!progress) return { progress: null, matchedCoordinate: null, matched: false, confidence: "low" };

    const accuracy = location.accuracy ?? Number.POSITIVE_INFINITY;
    const maxAccuracy = travelMode === "walking" ? 35 : 55;
    const maxDistance = travelMode === "walking" ? 28 : 48;
    const confidence = accuracy <= maxAccuracy * 0.65 && progress.distanceFromRouteMeters <= maxDistance * 0.65
      ? "high"
      : accuracy <= maxAccuracy && progress.distanceFromRouteMeters <= maxDistance
        ? "medium"
        : "low";
    const matched = confidence !== "low"
      && location.mode !== "GPS_SUSPICIOUS"
      && location.mode !== "GPS_STALE";
    return {
      progress,
      matchedCoordinate: matched ? progress.visualCoordinate : [location.longitude, location.latitude],
      matched,
      confidence,
    };
  }
}

export interface CameraFrameInput {
  state: NavigationState;
  cameraMode: NavigationCameraMode;
  coordinate: RouteCoordinate;
  routeRemaining: RouteCoordinate[];
  speedMps: number;
  bearing: number | null;
  maneuverDistanceMeters: number | null;
  travelMode: TravelMode;
  currentCenter: RouteCoordinate;
  currentZoom: number;
  currentBearing: number;
  currentPitch: number;
  deltaSeconds: number;
}

export interface CameraFrame {
  center: RouteCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
}

/** Stateful, damped camera planner. It never owns gestures; caller decides when FOLLOW is allowed. */
export class NavigationCameraController {
  private stableBearing = 0;
  private desiredZoom: number | null = null;

  resetBearing(value: number) {
    this.stableBearing = value;
  }

  frame(input: CameraFrameInput): CameraFrame {
    const speedKmh = Math.max(0, input.speedMps) * 3.6;
    const baseLookAhead = input.travelMode === "walking" ? 22 : 62;
    const speedLookAhead = input.travelMode === "walking"
      ? Math.min(18, input.speedMps * 5)
      : Math.min(160, input.speedMps * 6.5);
    const lookAhead = coordinateAtDistanceAlongRoute(input.routeRemaining, baseLookAhead + speedLookAhead) ?? input.coordinate;

    let targetZoom = input.travelMode === "walking" ? 17.35 : 16.35;
    if (input.travelMode === "walking") {
      if (speedKmh > 5) targetZoom = 17.0;
    } else if (speedKmh > 60) targetZoom = 15.0;
    else if (speedKmh > 25) targetZoom = 15.85;
    else if (speedKmh > 5) targetZoom = 16.55;

    const maneuver = input.maneuverDistanceMeters;
    if (maneuver !== null) {
      if (maneuver < 50) targetZoom += 0.55;
      else if (maneuver < 150) targetZoom += 0.3;
      else if (maneuver > 700) targetZoom -= 0.35;
    }

    if (this.desiredZoom === null || Math.abs(targetZoom - this.desiredZoom) > 0.28) this.desiredZoom = targetZoom;

    const routeTangent = input.routeRemaining.length > 1
      ? bearingBetween(input.routeRemaining[0], input.routeRemaining[Math.min(2, input.routeRemaining.length - 1)])
      : null;
    const movingEnough = input.travelMode === "walking" ? input.speedMps > 0.75 : input.speedMps > 2.3;
    const headingCandidate = movingEnough && input.bearing !== null
      ? input.bearing
      : movingEnough && routeTangent !== null
        ? routeTangent
        : this.stableBearing;
    if (movingEnough) this.stableBearing = normalizeBearing(headingCandidate);

    const headingUp = input.state === "FOLLOWING_HEADING" || input.state === "ARRIVING" || input.state === "OFFLINE_ROUTE";
    const targetBearing = headingUp ? this.stableBearing : 0;
    const targetPitch = input.travelMode === "walking" ? 32 : 44;

    const dt = clamp(input.deltaSeconds, 0, 0.05);
    const centerAlpha = 1 - Math.exp(-3.2 * dt);
    const scalarAlpha = 1 - Math.exp(-2.8 * dt);
    const bearingTarget = shortestBearingTarget(input.currentBearing, targetBearing);
    return {
      center: interpolateNavigationCoordinate(input.currentCenter, lookAhead, centerAlpha),
      zoom: input.currentZoom + ((this.desiredZoom ?? targetZoom) - input.currentZoom) * scalarAlpha,
      bearing: input.currentBearing + (bearingTarget - input.currentBearing) * scalarAlpha,
      pitch: input.currentPitch + (targetPitch - input.currentPitch) * scalarAlpha,
    };
  }
}

export interface NavigationViewModel {
  status: NavigationState;
  cameraMode: NavigationCameraMode;
  rawLocation: LocationSnapshot | null;
  trustedLocation: LocationSnapshot | null;
  visualLocation: RouteCoordinate | null;
  matchedLocation: RouteCoordinate | null;
  bearing: number | null;
  speed: number;
  gpsQuality: NavigationGpsQuality;
  route: NavigationRouteOption | null;
  routeProgress: NavigationProgress | null;
  currentManeuver: NavigationManeuver | null;
  nextManeuver: NavigationManeuver | null;
  distanceRemaining: number | null;
  durationRemaining: number | null;
  eta: Date | null;
  offRouteState: "on-route" | "pending" | "off-route";
}
