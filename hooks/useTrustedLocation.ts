"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import { classifyLocationFix, createLocationSnapshot, locationFreshness, type RawLocationFix } from "@/lib/nuresq/location";
import type { LocationSnapshot, LocationTrustMode } from "@/lib/nuresq/types";

export function useTrustedLocation() {
  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [requestState, setRequestState] = useState<LocationTrustMode>("GPS_UNAVAILABLE");
  const lastTrustedFix = useRef<RawLocationFix | null>(null);

  useEffect(() => {
    let cancelled = false;
    void EmergencyRepository.getTrustedLocation().then((saved) => {
      if (cancelled || !saved) return;
      lastTrustedFix.current = saved;
      const mode = locationFreshness(saved.timestamp) === "VERY_STALE" ? "GPS_STALE" : "LAST_TRUSTED";
      setLocation(createLocationSnapshot(saved, mode));
      setRequestState(mode);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocation((current) => {
        if (!current) return null;
        const freshness = locationFreshness(current.updatedAt);
        return {
          ...current,
          freshness,
          ageMs: Math.max(0, Date.now() - current.updatedAt),
          mode: freshness === "VERY_STALE" && current.mode !== "GPS_SUSPICIOUS" ? "GPS_STALE" : current.mode,
        };
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const applyLastTrusted = useCallback((mode: LocationTrustMode) => {
    const saved = lastTrustedFix.current;
    if (!saved) {
      setLocation(null);
      setRequestState("GPS_UNAVAILABLE");
      return;
    }
    const freshness = locationFreshness(saved.timestamp);
    const resolvedMode = mode === "GPS_SUSPICIOUS" ? mode : freshness === "VERY_STALE" ? "GPS_STALE" : "LAST_TRUSTED";
    setLocation(createLocationSnapshot(saved, resolvedMode));
    setRequestState(resolvedMode);
  }, []);

  const refresh = useCallback(() => {
    if (!("geolocation" in navigator)) {
      applyLastTrusted("GPS_UNAVAILABLE");
      return;
    }
    setRequestState("GPS_REQUESTING");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextFix: RawLocationFix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp || Date.now(),
        };
        const mode = classifyLocationFix(nextFix, lastTrustedFix.current);
        if (mode === "GPS_SUSPICIOUS") {
          applyLastTrusted(mode);
          return;
        }
        setLocation(createLocationSnapshot(nextFix, mode));
        setRequestState(mode);
        if (mode === "GPS_TRUSTED") {
          lastTrustedFix.current = nextFix;
          void EmergencyRepository.saveTrustedLocation(nextFix).catch(() => undefined);
        }
      },
      () => applyLastTrusted("GPS_UNAVAILABLE"),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 15_000 },
    );
  }, [applyLastTrusted]);

  return { location, requestState, refresh };
}
