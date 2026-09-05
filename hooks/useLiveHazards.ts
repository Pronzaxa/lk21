"use client";

import { useCallback, useEffect, useState } from "react";
import { dataFreshness } from "@/lib/nuresq/freshness";
import { parseBmkgEarthquake, parseBmkgWeather, withDistances } from "@/lib/nuresq/live-hazards";
import type { ActiveRegion, HazardSourceState, LiveHazardFeed, LocationSnapshot } from "@/lib/nuresq/types";

type FeedState = "loading" | "fresh" | "cached" | "error";

async function jsonFetch(url: string, timeoutMs = 9_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as unknown;
  } finally {
    window.clearTimeout(timeout);
  }
}

function sourceState(
  id: HazardSourceState["id"],
  label: string,
  result: PromiseSettledResult<unknown> | null,
  retrievedAt: string,
): HazardSourceState {
  if (!result) return { id, label, state: "not-configured", freshness: "UNKNOWN", note: "Wilayah aktif belum dipilih." };
  return result.status === "fulfilled"
    ? { id, label, state: "available", retrievedAt, freshness: "FRESH" }
    : { id, label, state: "unavailable", freshness: "UNKNOWN", note: "Sumber tidak dapat dijangkau." };
}

async function directBmkgFallback(location: LocationSnapshot | null, region: ActiveRegion | null): Promise<LiveHazardFeed> {
  const weatherPromise = region
    ? jsonFetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(region.adm4)}`, 8_000)
    : null;
  const [weatherSettled, earthquakeResult] = await Promise.allSettled([
    weatherPromise ?? Promise.resolve(null),
    jsonFetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json", 8_000),
  ]);
  const weatherResult = region ? weatherSettled : null;
  const availableCount = [weatherResult, earthquakeResult].filter((item) => item?.status === "fulfilled").length;
  if (!availableCount) throw new Error("BMKG unavailable");
  const retrievedAt = new Date().toISOString();
  const alerts = [
    ...(weatherResult?.status === "fulfilled" ? parseBmkgWeather(weatherResult.value) : []),
    ...(earthquakeResult.status === "fulfilled" ? parseBmkgEarthquake(earthquakeResult.value) : []),
  ];
  return {
    status: "partial",
    generatedAt: retrievedAt,
    retrievedAt,
    freshness: "FRESH",
    alerts: location ? withDistances(alerts, location.latitude, location.longitude) : alerts,
    sources: [
      sourceState("bmkg-weather", "BMKG · prakiraan cuaca", weatherResult, retrievedAt),
      sourceState("bmkg-earthquake", "BMKG · gempa", earthquakeResult, retrievedAt),
      { id: "petabencana", label: "PetaBencana · laporan warga", state: "unavailable", freshness: "UNKNOWN", note: "Memerlukan gateway web nuRESQ." },
    ],
    locationLabel: region?.label ?? (location ? "Sekitar lokasi perangkat" : "Wilayah cuaca belum dipilih"),
    regionId: region?.adm4 ?? null,
  };
}

function normalizeFeed(feed: LiveHazardFeed): LiveHazardFeed {
  const freshness = dataFreshness(feed.retrievedAt);
  return {
    ...feed,
    status: freshness === "STALE" ? "stale" : freshness === "AGING" ? "aging" : feed.status,
    freshness,
    alerts: feed.alerts.map((alert) => ({ ...alert, freshness: dataFreshness(alert.retrievedAt) })),
    sources: feed.sources.map((source) => ({
      ...source,
      freshness: source.retrievedAt ? dataFreshness(source.retrievedAt) : "UNKNOWN",
    })),
  };
}

async function fetchFeed(location: LocationSnapshot | null, region: ActiveRegion | null) {
  const endpoint = new URL("/api/hazards", window.location.origin);
  if (location) {
    endpoint.searchParams.set("lat", String(location.latitude));
    endpoint.searchParams.set("lon", String(location.longitude));
  }
  if (region) {
    endpoint.searchParams.set("adm4", region.adm4);
    endpoint.searchParams.set("region", region.label);
  }
  if (window.location.protocol === "file:") return directBmkgFallback(location, region);
  try {
    return normalizeFeed(await jsonFetch(endpoint.toString(), 11_000) as LiveHazardFeed);
  } catch {
    return directBmkgFallback(location, region);
  }
}

export function useLiveHazards(location: LocationSnapshot | null, region: ActiveRegion | null) {
  const [feed, setFeed] = useState<LiveHazardFeed | null>(null);
  const [state, setState] = useState<FeedState>("loading");

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const next = await fetchFeed(location, region);
      setFeed(next);
      setState(next.freshness === "FRESH" ? "fresh" : "cached");
    } catch {
      setFeed(null);
      setState("error");
    }
  }, [location?.latitude, location?.longitude, region?.adm4, region?.label]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  return { feed, state, refresh };
}
