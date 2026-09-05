import type { NavigationCameraMode, NavigationGestureKind, NavigationState } from "./types";

export type NavigationEvent =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "STARTED"; headingUp?: boolean }
  | { type: "USER_GESTURE"; gesture?: NavigationGestureKind }
  | { type: "RECENTER" }
  | { type: "FOLLOW_HEADING" }
  | { type: "RECENTERED"; headingUp?: boolean }
  | { type: "NORTH_UP" }
  | { type: "OVERVIEW" }
  | { type: "GPS_WEAK" }
  | { type: "GPS_STALE" }
  | { type: "GPS_RECOVERED"; headingUp?: boolean }
  | { type: "NETWORK_DEGRADED" }
  | { type: "NETWORK_RECOVERED"; headingUp?: boolean }
  | { type: "OFF_ROUTE_POSSIBLE" }
  | { type: "OFF_ROUTE_CONFIRMED" }
  | { type: "ON_ROUTE"; headingUp?: boolean }
  | { type: "REROUTE_SUCCESS"; headingUp?: boolean }
  | { type: "REROUTE_FAILURE" }
  | { type: "OFFLINE_ROUTE" }
  | { type: "DIRECTION_ONLY" }
  | { type: "ARRIVING" }
  | { type: "ARRIVED" }
  | { type: "END" };

const ACTIVE_STATES: NavigationState[] = [
  "NAV_STARTING",
  "FOLLOWING",
  "FOLLOWING_HEADING",
  "FREE_PAN",
  "FREE_ZOOM",
  "RECENTERING",
  "ROUTE_OVERVIEW",
  "OFF_ROUTE_PENDING",
  "REROUTING",
  "GPS_WEAK",
  "GPS_STALE",
  "NETWORK_DEGRADED",
  "OFFLINE_ROUTE",
  "DIRECTION_ONLY",
  "ARRIVING",
];

export function isNavigationActive(state: NavigationState) {
  return ACTIVE_STATES.includes(state) || state === "ARRIVED";
}

export function isExploreState(state: NavigationState) {
  return state === "FREE_PAN" || state === "FREE_ZOOM";
}

export function isFollowState(state: NavigationState) {
  return state === "FOLLOWING" || state === "FOLLOWING_HEADING" || state === "ARRIVING" || state === "OFFLINE_ROUTE";
}

export function cameraModeForState(state: NavigationState): NavigationCameraMode {
  if (state === "ROUTE_OVERVIEW") return "OVERVIEW";
  if (isExploreState(state)) return "EXPLORE";
  return "FOLLOW";
}

function followState(headingUp = true): NavigationState {
  return headingUp ? "FOLLOWING_HEADING" : "FOLLOWING";
}

export function navigationStateReducer(state: NavigationState, event: NavigationEvent): NavigationState {
  switch (event.type) {
    case "RESET":
      return "ROUTE_PREVIEW";
    case "START":
      return "NAV_STARTING";
    case "STARTED":
      return state === "NAV_STARTING" ? followState(event.headingUp ?? true) : state;
    case "USER_GESTURE":
      if (!isNavigationActive(state) || state === "ARRIVED") return state;
      return event.gesture === "zoom" ? "FREE_ZOOM" : "FREE_PAN";
    case "OVERVIEW":
      return isNavigationActive(state) && state !== "ARRIVED" ? "ROUTE_OVERVIEW" : state;
    case "RECENTER":
      return isNavigationActive(state) && state !== "ARRIVED" ? "RECENTERING" : state;
    case "RECENTERED":
      return state === "RECENTERING" ? followState(event.headingUp ?? false) : state;
    case "FOLLOW_HEADING":
      return state === "FOLLOWING" ? "FOLLOWING_HEADING" : state;
    case "NORTH_UP":
      return isNavigationActive(state) && state !== "ARRIVED" ? "FOLLOWING" : state;
    case "GPS_WEAK":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "GPS_WEAK" : state;
    case "GPS_STALE":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "GPS_STALE" : state;
    case "GPS_RECOVERED":
      return state === "GPS_WEAK" || state === "GPS_STALE" ? followState(event.headingUp ?? true) : state;
    case "NETWORK_DEGRADED":
      return isFollowState(state) ? "NETWORK_DEGRADED" : state;
    case "NETWORK_RECOVERED":
      return state === "NETWORK_DEGRADED" ? followState(event.headingUp ?? true) : state;
    case "OFF_ROUTE_POSSIBLE":
      return isFollowState(state) ? "OFF_ROUTE_PENDING" : state;
    case "OFF_ROUTE_CONFIRMED":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "REROUTING" : state;
    case "ON_ROUTE":
      return state === "OFF_ROUTE_PENDING" ? followState(event.headingUp ?? true) : state;
    case "REROUTE_SUCCESS":
      return state === "REROUTING" || state === "DIRECTION_ONLY" ? followState(event.headingUp ?? true) : state;
    case "REROUTE_FAILURE":
      return state === "REROUTING" ? "DIRECTION_ONLY" : state;
    case "OFFLINE_ROUTE":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "OFFLINE_ROUTE" : state;
    case "DIRECTION_ONLY":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "DIRECTION_ONLY" : state;
    case "ARRIVING":
      return isNavigationActive(state) && state !== "ARRIVED" && !isExploreState(state) ? "ARRIVING" : state;
    case "ARRIVED":
      return isNavigationActive(state) ? "ARRIVED" : state;
    case "END":
      return "ENDED";
    default:
      return state;
  }
}
