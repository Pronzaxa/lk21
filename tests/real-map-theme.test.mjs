import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("peta memakai MapLibre, raster OpenStreetMap, dan routing yang jujur per mode", async () => {
  const [source, routing, routeHook] = await Promise.all([
    readFile(`${root}/components/nuresq/SafetyMap.tsx`, "utf8"),
    readFile(`${root}/lib/nuresq/routing.ts`, "utf8"),
    readFile(`${root}/hooks/useNavigationRoute.ts`, "utf8"),
  ]);

  assert.match(source, /import\("maplibre-gl"\)/);
  assert.match(source, /basemaps\.cartocdn\.com/);
  assert.match(source, /tile\.openstreetmap\.org/);
  assert.match(routeHook, /router\.project-osrm\.org\/route\/v1\/driving/);
  assert.doesNotMatch(source, /navigator\.onLine/);
  assert.match(routeHook, /providerSupportsMode\(travelMode\)/);
  assert.match(routeHook, /directionOnlyFallback/);
  assert.match(routing, /Rute jalan kaki belum tersedia penuh/);
  assert.match(source, /style\.load/);
  assert.match(source, /MAP_LOAD_TIMEOUT_MS/);
  assert.match(source, /applyFallback/);
  assert.match(source, /raster-fallback-map/);
  assert.match(source, /lngLatToWorld/);
  assert.match(source, /mapStatus !== "ready"/);
  assert.match(source, /hasUserLocation=\{Boolean\(userLocation\)\}/);
  assert.doesNotMatch(source, /DEFAULT_LOCATION/);
});

test("tema terang dapat dipilih dan mode gelap tidak lagi dipaksakan", async () => {
  const [app, settings, styles] = await Promise.all([
    readFile(`${root}/components/nuresq/NuResqApp.tsx`, "utf8"),
    readFile(`${root}/components/nuresq/AccountView.tsx`, "utf8"),
    readFile(`${root}/styles/nuresq-light.css`, "utf8"),
  ]);

  assert.doesNotMatch(app, /forcedTheme=/);
  assert.match(app, /setTheme\(isLight \? "dark" : "light"\)/);
  assert.match(settings, /id: "light", label: "Terang"/);
  assert.match(styles, /\.light \.mobile-bottom-nav/);
});
