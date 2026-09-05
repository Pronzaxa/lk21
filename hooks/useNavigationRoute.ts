"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseOsrmRoutes, routeSummaryFromOption, type OsrmResponsePayload } from "@/lib/nuresq/navigation-route";
import { directionOnlyFallback, providerSupportsMode } from "@/lib/nuresq/routing";
import type { Destination, MapRouteSummary, NavigationRouteOption, TravelMode } from "@/lib/nuresq/types";

type RouteLoadState = "idle" | "loading" | "ready" | "direction";

export function useNavigationRoute({
  origin,
  destination,
  travelMode,
  requestRevision,
}: {
  origin: [number, number] | null;
  destination: Destination;
  travelMode: TravelMode;
  requestRevision: number;
}) {
  const [options, setOptions] = useState<NavigationRouteOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fallbackSummary, setFallbackSummary] = useState<MapRouteSummary | null>(null);
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null);
  const [state, setState] = useState<RouteLoadState>("idle");
  const [loadedRevision, setLoadedRevision] = useState(-1);

  useEffect(() => {
    if (!origin) {
      const timer = window.setTimeout(() => {
        setOptions([]);
        setFallbackSummary(null);
        setState("idle");
        setLoadedRevision(requestRevision);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const destinationCoordinate: [number, number] = [destination.longitude, destination.latitude];
    const fallback = () => {
      setOptions([]);
      setSelectedIndex(0);
      setFallbackSummary(directionOnlyFallback(origin, destinationCoordinate, travelMode));
      setState("direction");
      setLoadedRevision(requestRevision);
    };
    if (!providerSupportsMode(travelMode)) {
      const timer = window.setTimeout(fallback, 0);
      return () => window.clearTimeout(timer);
    }

    const abortController = new AbortController();
    const loadingTimer = window.setTimeout(() => setState("loading"), 0);
    const coordinates = `${origin[0]},${origin[1]};${destinationCoordinate[0]},${destinationCoordinate[1]}`;
    const endpoint = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    void fetch(endpoint, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("route unavailable");
        return {
          payload: await response.json() as OsrmResponsePayload,
          cachedAt: response.headers.get("X-nuRESQ-Cached-At"),
        };
      })
      .then(({ payload, cachedAt }) => {
        const nextOptions = parseOsrmRoutes(payload);
        if (!nextOptions.length) throw new Error("route unavailable");
        setOptions(nextOptions);
        setSelectedIndex(0);
        setFallbackSummary(null);
        setRetrievedAt(cachedAt ?? new Date().toISOString());
        setState("ready");
        setLoadedRevision(requestRevision);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        fallback();
      });
    return () => {
      window.clearTimeout(loadingTimer);
      abortController.abort();
    };
  }, [destination.id, destination.latitude, destination.longitude, origin, requestRevision, travelMode]);

  const summary = useMemo(() => {
    if (fallbackSummary) return fallbackSummary;
    const selected = options[selectedIndex];
    if (!selected || !retrievedAt) return null;
    return routeSummaryFromOption(selected, options, retrievedAt, travelMode);
  }, [fallbackSummary, options, retrievedAt, selectedIndex, travelMode]);

  const selectAlternative = useCallback((index: number) => {
    if (index < 0 || index >= options.length) return;
    setSelectedIndex(index);
  }, [options.length]);

  return { summary, options, selectedIndex, selectAlternative, state, loadedRevision };
}
