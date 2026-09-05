import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

function incident(status = "LOCAL_SAVED", acknowledgement = null) {
  return {
    incident_id: "NR-test",
    type: "Banjir",
    description: "kami berdua",
    latitude: null,
    longitude: null,
    location_trust: "UNAVAILABLE",
    location_accuracy_m: null,
    location_updated_at: null,
    victim_count: 2,
    mobility: "normal",
    risk_level: "PRIORITAS SEDANG",
    requested_help: "evakuasi",
    injury_triage: null,
    timestamp: "2026-08-30T00:00:00.000Z",
    connectivity_state: "OFFLINE",
    delivery_status: status,
    delivery_capability: "DELIVERY_NOT_CONFIGURED",
    acknowledgement,
    last_delivery_attempt_at: null,
  };
}

test("SOS offline tetap pending setelah jaringan tersedia sampai ACK nyata", async () => {
  const { remainsPendingUntilAcknowledged, hasVerifiedAcknowledgement, transitionDeliveryStatus } = await vite.ssrLoadModule("/lib/nuresq/delivery.ts");
  const saved = incident();
  assert.equal(remainsPendingUntilAcknowledged(saved), true);
  assert.equal(transitionDeliveryStatus(saved.delivery_status, "SAVE_LOCAL"), "LOCAL_SAVED");
  assert.equal(hasVerifiedAcknowledgement({ ...saved, delivery_status: "ACKNOWLEDGED" }), false);
  const acknowledged = incident("ACKNOWLEDGED", { id: "ack-server-1", acknowledgedAt: "2026-08-30T00:05:00.000Z" });
  assert.equal(hasVerifiedAcknowledgement(acknowledged), true);
  assert.equal(remainsPendingUntilAcknowledged(acknowledged), false);
});

test("repository darurat memakai IndexedDB dan tidak memakai localStorage sebagai store utama", async () => {
  const [repository, app] = await Promise.all([
    readFile(`${root}/lib/nuresq/emergency-repository.ts`, "utf8"),
    readFile(`${root}/components/nuresq/NuResqApp.tsx`, "utf8"),
  ]);
  assert.match(repository, /indexedDB\.open/);
  assert.match(repository, /getPendingIncidents/);
  assert.match(repository, /ACK nyata diperlukan/);
  assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\("nuresq-sos/);
  assert.doesNotMatch(app, /removeItem\("nuresq-sos-queue"/);
});

test("mode jalan kaki dan kendaraan memakai estimasi berbeda dan fallback hanya arah", async () => {
  const { directionOnlyFallback, providerSupportsMode } = await vite.ssrLoadModule("/lib/nuresq/routing.ts");
  const from = [112.63, -7.98];
  const to = [112.64, -7.97];
  const walking = directionOnlyFallback(from, to, "walking", new Date("2026-08-30T00:00:00Z"));
  const driving = directionOnlyFallback(from, to, "driving", new Date("2026-08-30T00:00:00Z"));
  assert.equal(providerSupportsMode("walking"), false);
  assert.equal(providerSupportsMode("driving"), true);
  assert.equal(walking.mode, "direction");
  assert.equal(walking.provider, "direction-only");
  assert.ok(walking.durationSeconds > driving.durationSeconds);
  assert.match(walking.nextInstruction, /jalan kaki belum tersedia penuh/i);
});

test("connectivity tidak menyamakan flag browser dengan service reachable", async () => {
  const { checkConnectivity } = await vite.ssrLoadModule("/lib/nuresq/connectivity.ts");
  const offline = await checkConnectivity({ navigatorOnline: false, fetcher: async () => new Response(null, { status: 200 }) });
  assert.equal(offline.state, "OFFLINE");
  const degraded = await checkConnectivity({ navigatorOnline: true, timeoutMs: 20, fetcher: async () => { throw new Error("unreachable"); } });
  assert.equal(degraded.state, "DEGRADED");
  const connected = await checkConnectivity({ navigatorOnline: true, fetcher: async () => new Response("{}", { status: 200 }) });
  assert.equal(connected.state, "CONNECTED");
});

test("service worker memisahkan app, tile, route, dan data cache", async () => {
  const sw = await readFile(`${root}/public/sw.js`, "utf8");
  for (const token of ["APP_CACHE", "TILE_CACHE", "ROUTE_CACHE", "DATA_CACHE"]) assert.match(sw, new RegExp(token));
  assert.match(sw, /X-nuRESQ-Cached-At/);
  assert.match(sw, /\[ROUTE_CACHE\]: 40/);
});
