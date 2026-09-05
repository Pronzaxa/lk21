"use client";

import { useEffect, useRef, useState } from "react";
import { bearingBetween, coordinateAtRouteFraction } from "@/lib/nuresq/navigation";
import {
  classifyLocationFix,
  createLocationSnapshot,
  locationFreshness,
  type RawLocationFix,
} from "@/lib/nuresq/location";
import type { LocationSnapshot, NavigationRunMode } from "@/lib/nuresq/types";

interface NavigationTrackingOptions {
  active: boolean;
  baseLocation: LocationSnapshot | null;
  routeCoordinates: Array<[number, number]>;
  runMode: NavigationRunMode;
}

function toFix(snapshot: LocationSnapshot): RawLocationFix {
  return {
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    accuracy: snapshot.accuracy ?? 999,
    heading: snapshot.heading ?? null,
    speed: snapshot.speed ?? null,
    timestamp: snapshot.updatedAt,
  };
}

/**
 * Fix-level tracking only. 60-FPS visual interpolation is intentionally handled by
 * NavigationRenderLoop so React is not re-rendered on every animation frame.
 */
export function useNavigationTracking({ active, baseLocation, routeCoordinates, runMode }: NavigationTrackingOptions) {
  const [navigationLocation, setNavigationLocation] = useState<LocationSnapshot | null>(baseLocation);
  const [rawLocation, setRawLocation] = useState<LocationSnapshot | null>(baseLocation);
  const [trustedLocation, setTrustedLocation] = useState<LocationSnapshot | null>(baseLocation?.mode === "GPS_TRUSTED" ? baseLocation : null);
  const [fixSequence, setFixSequence] = useState(0);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const lastAcceptedFix = useRef<RawLocationFix | null>(baseLocation ? toFix(baseLocation) : null);

  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => {
      setNavigationLocation(baseLocation);
      setRawLocation(baseLocation);
      setTrustedLocation(baseLocation?.mode === "GPS_TRUSTED" ? baseLocation : null);
      lastAcceptedFix.current = baseLocation ? toFix(baseLocation) : null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, baseLocation]);

  useEffect(() => {
    if (!active || runMode !== "DEMO_NAVIGATION" || routeCoordinates.length < 2) return;
    let progress = 0;
    const timer = window.setInterval(() => {
      progress = Math.min(1, progress + 0.0125);
      const coordinate = coordinateAtRouteFraction(routeCoordinates, progress);
      const ahead = coordinateAtRouteFraction(routeCoordinates, Math.min(1, progress + 0.008));
      if (!coordinate || !ahead) return;
      const now = Date.now();
      const snapshot: LocationSnapshot = {
        latitude: coordinate[1], longitude: coordinate[0], accuracy: 6,
        heading: bearingBetween(coordinate, ahead), speed: 1.35, updatedAt: now,
        mode: "GPS_TRUSTED", label: "Simulasi navigasi", freshness: "FRESH", ageMs: 0,
      };
      // Simulation is navigation-only. It is never promoted to trusted safety coordinates.
      setRawLocation(snapshot);
      setNavigationLocation(snapshot);
      setTrustedLocation(null);
      setFixSequence((current) => current + 1);
      if (progress >= 1) window.clearInterval(timer);
    }, 720);
    return () => window.clearInterval(timer);
  }, [active, routeCoordinates, runMode]);

  useEffect(() => {
    if (!active || runMode !== "REAL_NAVIGATION") return;
    if (!("geolocation" in navigator)) {
      const timer = window.setTimeout(() => setTrackingError("GPS tidak tersedia pada perangkat ini."), 0);
      return () => window.clearTimeout(timer);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const fix: RawLocationFix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp || Date.now(),
        };
        const mode = classifyLocationFix(fix, lastAcceptedFix.current);
        const snapshot = createLocationSnapshot(fix, mode);
        setRawLocation(snapshot);
        setFixSequence((current) => current + 1);
        setTrackingError(null);

        if (mode === "GPS_SUSPICIOUS") {
          setNavigationLocation((current) => current ? { ...current, mode: "GPS_SUSPICIOUS", label: snapshot.label } : snapshot);
          return;
        }
        setNavigationLocation(snapshot);
        if (mode === "GPS_TRUSTED") {
          lastAcceptedFix.current = fix;
          setTrustedLocation(snapshot);
        }
      },
      () => setTrackingError("Lokasi baru belum diterima; memakai lokasi terakhir."),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, runMode]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setNavigationLocation((current) => {
        if (!current) return null;
        const freshness = locationFreshness(current.updatedAt);
        return {
          ...current,
          ageMs: Math.max(0, Date.now() - current.updatedAt),
          freshness,
          mode: freshness === "VERY_STALE" ? "GPS_STALE" : current.mode,
        };
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [active]);

  return {
    location: navigationLocation, // compatibility alias
    navigationLocation,
    rawLocation,
    trustedLocation,
    fixSequence,
    trackingError,
    isSimulated: runMode === "DEMO_NAVIGATION",
  };
}
