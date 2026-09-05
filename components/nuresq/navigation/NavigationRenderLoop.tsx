"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { LngLatBounds, type Map as MapLibreMap, type Marker as MapLibreMarker } from "maplibre-gl";
import {
  NavigationCameraController,
  NavigationLocationSmoother,
} from "@/lib/nuresq/navigation-engine";
import { coordinateAtDistanceAlongRoute, shortestBearingTarget } from "@/lib/nuresq/navigation";
import { isExploreState } from "@/lib/nuresq/navigation-state";
import type {
  LocationSnapshot,
  NavigationCameraMode,
  NavigationState,
  TravelMode,
} from "@/lib/nuresq/types";

const CAMERA_BLOCKED_STATES: NavigationState[] = ["GPS_STALE", "ARRIVED", "ENDED", "ROUTE_PREVIEW", "NAV_STARTING"];

export function NavigationRenderLoop({
  map,
  mapReady,
  puck,
  puckElement,
  state,
  cameraMode,
  location,
  visualTarget,
  remainingRoute,
  travelMode,
  maneuverDistanceMeters,
  topInset,
  bottomInset,
  rightInset,
  onRecenterComplete,
}: {
  map: MapLibreMap | null;
  mapReady: boolean;
  puck: MapLibreMarker | null;
  puckElement: HTMLElement | null;
  state: NavigationState;
  cameraMode: NavigationCameraMode;
  location: LocationSnapshot | null;
  visualTarget: [number, number] | null;
  remainingRoute: Array<[number, number]>;
  travelMode: TravelMode;
  maneuverDistanceMeters: number | null;
  topInset: number;
  bottomInset: number;
  rightInset: number;
  onRecenterComplete?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const smootherRef = useRef(new NavigationLocationSmoother());
  const cameraRef = useRef(new NavigationCameraController());
  const stateRef = useRef(state);
  const cameraModeRef = useRef(cameraMode);
  const routeRef = useRef(remainingRoute);
  const locationRef = useRef(location);
  const maneuverRef = useRef(maneuverDistanceMeters);
  const travelModeRef = useRef(travelMode);
  const puckBearingRef = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { routeRef.current = remainingRoute; }, [remainingRoute]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { maneuverRef.current = maneuverDistanceMeters; }, [maneuverDistanceMeters]);
  useEffect(() => { travelModeRef.current = travelMode; }, [travelMode]);

  useEffect(() => {
    if (!location || !visualTarget) return;
    smootherRef.current.pushFix(location, visualTarget);
  }, [location, visualTarget]);

  useEffect(() => {
    if (!mapReady || !map) return;
    map.setPadding({ top: topInset, bottom: bottomInset, right: rightInset, left: 24 });
  }, [bottomInset, map, mapReady, rightInset, topInset]);

  useEffect(() => {
    if (!mapReady || !map || cameraMode !== "OVERVIEW" || remainingRoute.length < 2) return;
    const bounds = remainingRoute.reduce(
      (current, coordinate) => current.extend(coordinate),
      new LngLatBounds(remainingRoute[0], remainingRoute[0]),
    );
    map.fitBounds(bounds, {
      padding: { top: topInset + 14, right: rightInset + 18, bottom: bottomInset + 18, left: 36 },
      maxZoom: 15.2,
      pitch: 8,
      bearing: 0,
      duration: reduceMotion ? 0 : 680,
      essential: true,
    });
  }, [bottomInset, cameraMode, map, mapReady, reduceMotion, remainingRoute, rightInset, topInset]);

  useEffect(() => {
    if (!mapReady || !map || state !== "RECENTERING" || !location || !visualTarget) return;
    const route = remainingRoute.length > 1 ? remainingRoute : [visualTarget];
    const aheadMeters = travelMode === "walking" ? 20 : 58;
    const center = coordinateAtDistanceAlongRoute(route, aheadMeters) ?? visualTarget;
    map.easeTo({
      center,
      zoom: travelMode === "walking" ? 17.2 : 16.2,
      bearing: 0,
      pitch: travelMode === "walking" ? 30 : 42,
      duration: reduceMotion ? 0 : 720,
      easing: (t) => 1 - (1 - t) ** 3,
      essential: true,
    });
    const timer = window.setTimeout(() => onRecenterComplete?.(), reduceMotion ? 0 : 735);
    return () => window.clearTimeout(timer);
  }, [location, map, mapReady, onRecenterComplete, reduceMotion, remainingRoute, state, travelMode, visualTarget]);

  useEffect(() => {
    if (!mapReady || !map || !puck) return;
    let frame = 0;
    let previousTime = performance.now();

    const tick = (now: number) => {
      const deltaSeconds = Math.max(1 / 120, Math.min(0.05, (now - previousTime) / 1_000));
      previousTime = now;
      const sample = smootherRef.current.sample(now);
      if (sample) {
        puck.setLngLat(sample.coordinate);
        const bearingNode = puckElement?.querySelector<HTMLElement>(".navigation-puck-bearing") ?? null;
        if (bearingNode && sample.bearing !== null) {
          const target = sample.bearing - map.getBearing();
          puckBearingRef.current = shortestBearingTarget(puckBearingRef.current, target);
          bearingNode.style.transform = `rotate(${puckBearingRef.current}deg)`;
        }

        const currentState = stateRef.current;
        const followAllowed = cameraModeRef.current === "FOLLOW"
          && !isExploreState(currentState)
          && !CAMERA_BLOCKED_STATES.includes(currentState)
          && currentState !== "RECENTERING"
          && currentState !== "ROUTE_OVERVIEW";

        if (followAllowed && !sample.stale) {
          const center = map.getCenter();
          const framePlan = cameraRef.current.frame({
            state: currentState,
            cameraMode: cameraModeRef.current,
            coordinate: sample.coordinate,
            routeRemaining: routeRef.current.length > 1 ? routeRef.current : [sample.coordinate],
            speedMps: sample.speedMps,
            bearing: sample.bearing,
            maneuverDistanceMeters: maneuverRef.current,
            travelMode: travelModeRef.current,
            currentCenter: [center.lng, center.lat],
            currentZoom: map.getZoom(),
            currentBearing: map.getBearing(),
            currentPitch: map.getPitch(),
            deltaSeconds,
          });
          map.jumpTo({
            center: framePlan.center,
            zoom: framePlan.zoom,
            bearing: framePlan.bearing,
            pitch: framePlan.pitch,
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, mapReady, puck, puckElement]);

  return null;
}
