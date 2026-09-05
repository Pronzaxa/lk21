import { parseBmkgEarthquake, parseBmkgWeather, parsePetaBencana, withDistances } from "@/lib/nuresq/live-hazards";
import { dataFreshness } from "@/lib/nuresq/freshness";
import type { HazardSourceState, LiveHazardFeed } from "@/lib/nuresq/types";

const CACHE_TTL_MS = 3 * 60 * 1000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let cached: { key: string; storedAt: number; feed: LiveHazardFeed } | null = null;

function optionalNumber(value: string | null) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url: string, timeoutMs: number, headers?: HeadersInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function source(
  id: HazardSourceState["id"],
  label: string,
  result: PromiseSettledResult<unknown> | null,
  retrievedAt: string,
): HazardSourceState {
  if (!result) {
    return { id, label, state: "not-configured", freshness: "UNKNOWN", note: "Pilih wilayah aktif untuk data cuaca." };
  }
  return result.status === "fulfilled"
    ? { id, label, state: "available", retrievedAt, freshness: dataFreshness(retrievedAt) }
    : { id, label, state: "unavailable", freshness: "UNKNOWN", note: "Sumber tidak merespons; data tidak diterka." };
}

function refreshCachedFeed(feed: LiveHazardFeed): LiveHazardFeed {
  const freshness = dataFreshness(feed.retrievedAt);
  return {
    ...feed,
    status: freshness === "STALE" ? "stale" : freshness === "AGING" ? "aging" : feed.status,
    freshness,
    alerts: feed.alerts.map((alert) => ({ ...alert, freshness: dataFreshness(alert.retrievedAt) })),
    sources: feed.sources.map((item) => ({
      ...item,
      freshness: item.retrievedAt ? dataFreshness(item.retrievedAt) : "UNKNOWN",
    })),
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const latitude = optionalNumber(requestUrl.searchParams.get("lat"));
  const longitude = optionalNumber(requestUrl.searchParams.get("lon"));
  const adm4Raw = requestUrl.searchParams.get("adm4")?.replace(/[^0-9.]/g, "") ?? "";
  const adm4 = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4Raw) ? adm4Raw : null;
  const regionLabel = requestUrl.searchParams.get("region")?.slice(0, 80) || null;
  const key = `${adm4 ?? "no-region"}:${latitude?.toFixed(2) ?? "no-lat"}:${longitude?.toFixed(2) ?? "no-lon"}`;

  if (cached?.key === key && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return Response.json(refreshCachedFeed(cached.feed), {
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=600", "X-nuRESQ-Cache": "hit" },
    });
  }

  const weatherPromise = adm4
    ? fetchJson(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(adm4)}`, 7_000)
    : null;
  const tasks = [
    weatherPromise ?? Promise.resolve(null),
    fetchJson("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json", 7_000),
    fetchJson("https://api.petabencana.id/reports?geoformat=geojson&timeperiod=10800", 10_000, {
      "User-Agent": "nuRESQ/1.0 (+https://nuresq-emergency.zingers-redder-5b.chatgpt.site)",
    }),
  ];
  const [weatherSettled, earthquakeResult, communityResult] = await Promise.allSettled(tasks);
  const weatherResult = adm4 ? weatherSettled : null;
  const retrievedAt = new Date().toISOString();
  const alerts = [
    ...(weatherResult?.status === "fulfilled" ? parseBmkgWeather(weatherResult.value) : []),
    ...(earthquakeResult.status === "fulfilled" ? parseBmkgEarthquake(earthquakeResult.value) : []),
    ...(communityResult.status === "fulfilled" ? parsePetaBencana(communityResult.value) : []),
  ];
  const sources = [
    source("bmkg-weather", "BMKG · prakiraan cuaca", weatherResult, retrievedAt),
    source("bmkg-earthquake", "BMKG · gempa", earthquakeResult, retrievedAt),
    source("petabencana", "PetaBencana · laporan warga", communityResult, retrievedAt),
  ];
  const availableCount = sources.filter((item) => item.state === "available").length;
  const locatedAlerts = latitude !== null && longitude !== null ? withDistances(alerts, latitude, longitude) : alerts;
  const feed: LiveHazardFeed = {
    status: availableCount === 0 ? "unavailable" : availableCount === sources.length ? "fresh" : "partial",
    generatedAt: retrievedAt,
    retrievedAt,
    freshness: availableCount ? "FRESH" : "UNKNOWN",
    alerts: locatedAlerts.slice(0, 24),
    sources,
    locationLabel: regionLabel ?? (latitude !== null && longitude !== null ? "Sekitar lokasi perangkat" : "Wilayah cuaca belum dipilih"),
    regionId: adm4,
  };

  if (availableCount === 0 && cached?.key === key) {
    return Response.json(refreshCachedFeed(cached.feed), {
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store", "X-nuRESQ-Cache": "stale" },
    });
  }
  if (availableCount > 0) cached = { key, storedAt: Date.now(), feed };
  return Response.json(feed, {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=600", "X-nuRESQ-Cache": "miss" },
  });
}
