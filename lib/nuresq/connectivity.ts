import type { ConnectivityState, NetworkMode } from "./types";

export interface ConnectivityReport {
  state: ConnectivityState;
  checkedAt: string;
  browserOnline: boolean;
  publicEndpointReachable: boolean;
  backendConfigured: boolean;
  backendReachable: boolean | null;
}

const PUBLIC_PROBE = "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json";

async function reachable(url: string, timeoutMs: number, fetcher: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const probe = new URL(url, typeof location === "undefined" ? "https://nuresq.invalid" : location.origin);
    probe.searchParams.set("nuresq_probe", String(Date.now()));
    const response = await fetcher(probe.toString(), { method: "GET", cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkConnectivity(options: {
  navigatorOnline?: boolean;
  backendEndpoint?: string | null;
  publicEndpoint?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}): Promise<ConnectivityReport> {
  const browserOnline = options.navigatorOnline
    ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  const checkedAt = new Date().toISOString();
  const backendConfigured = Boolean(options.backendEndpoint);
  if (!browserOnline) {
    return { state: "OFFLINE", checkedAt, browserOnline, publicEndpointReachable: false, backendConfigured, backendReachable: null };
  }

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const publicEndpointReachable = await reachable(options.publicEndpoint ?? PUBLIC_PROBE, timeoutMs, fetcher);
  if (!publicEndpointReachable) {
    return { state: "DEGRADED", checkedAt, browserOnline, publicEndpointReachable, backendConfigured, backendReachable: null };
  }

  if (!options.backendEndpoint) {
    return { state: "CONNECTED", checkedAt, browserOnline, publicEndpointReachable, backendConfigured, backendReachable: null };
  }
  const backendReachable = await reachable(options.backendEndpoint, timeoutMs, fetcher);
  return {
    state: backendReachable ? "CONNECTED" : "BACKEND_UNREACHABLE",
    checkedAt,
    browserOnline,
    publicEndpointReachable,
    backendConfigured,
    backendReachable,
  };
}

export function connectivityToNetworkMode(state: ConnectivityState): NetworkMode {
  if (state === "CONNECTED") return "online";
  if (state === "OFFLINE") return "offline";
  return "terbatas";
}
