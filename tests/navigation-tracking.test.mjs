import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

test("progress rute memakai snapped visual coordinate tanpa mengubah lokasi mentah", async () => {
  const { calculateRouteProgress } = await vite.ssrLoadModule("/lib/nuresq/navigation.ts");
  const route = [[112.63, -7.98], [112.64, -7.98], [112.65, -7.98]];
  const raw = [112.637, -7.97988];
  const progress = calculateRouteProgress(raw, route, 2_200, 1_000);
  assert.ok(progress);
  assert.ok(progress.fraction > 0.2 && progress.fraction < 0.5);
  assert.ok(progress.distanceFromRouteMeters > 5);
  assert.notDeepEqual(progress.visualCoordinate, raw);
  assert.equal(progress.visualCoordinate[1], -7.98);
  assert.ok(progress.travelledCoordinates.length >= 2);
  assert.ok(progress.remainingCoordinates.length >= 2);
});

test("bearing 359 ke 0 memilih lintasan sudut terpendek", async () => {
  const { shortestBearingTarget } = await vite.ssrLoadModule("/lib/nuresq/navigation.ts");
  assert.equal(shortestBearingTarget(359, 0), 360);
  assert.equal(shortestBearingTarget(1, 359), -1);
  assert.equal(shortestBearingTarget(45, 90), 90);
});

test("state navigasi menangani start, gesture, recenter, reroute, dan selesai", async () => {
  const { navigationStateReducer } = await vite.ssrLoadModule("/lib/nuresq/navigation-state.ts");
  let state = navigationStateReducer("ROUTE_PREVIEW", { type: "START" });
  assert.equal(state, "NAV_STARTING");
  state = navigationStateReducer(state, { type: "STARTED", headingUp: true });
  assert.equal(state, "FOLLOWING_HEADING");
  state = navigationStateReducer(state, { type: "USER_GESTURE", gesture: "pan" });
  assert.equal(state, "FREE_PAN");
  state = navigationStateReducer(state, { type: "RECENTER" });
  assert.equal(state, "RECENTERING");
  state = navigationStateReducer(state, { type: "RECENTERED", headingUp: false });
  assert.equal(state, "FOLLOWING");
  state = navigationStateReducer(state, { type: "OFF_ROUTE_CONFIRMED" });
  assert.equal(state, "REROUTING");
  state = navigationStateReducer(state, { type: "REROUTE_FAILURE" });
  assert.equal(state, "DIRECTION_ONLY");
  state = navigationStateReducer(state, { type: "ARRIVED" });
  assert.equal(state, "ARRIVED");
  state = navigationStateReducer(state, { type: "END" });
  assert.equal(state, "ENDED");
});

test("satu atau dua titik GPS noisy tidak memicu reroute", async () => {
  const { updateOffRouteTracker } = await vite.ssrLoadModule("/lib/nuresq/navigation.ts");
  let tracker = { consecutiveOutside: 0, offRoute: false };
  tracker = updateOffRouteTracker(tracker, 70, "walking");
  assert.equal(tracker.offRoute, false);
  tracker = updateOffRouteTracker(tracker, 71, "walking");
  assert.equal(tracker.offRoute, false);
  tracker = updateOffRouteTracker(tracker, 72, "walking");
  assert.equal(tracker.offRoute, true);
  tracker = updateOffRouteTracker(tracker, 8, "walking");
  assert.deepEqual(tracker, { consecutiveOutside: 0, offRoute: false });

  let vehicle = { consecutiveOutside: 0, offRoute: false };
  vehicle = updateOffRouteTracker(vehicle, 60, "driving");
  assert.equal(vehicle.offRoute, false);
});

test("camera plan membedakan heading-up, overview, pedestrian, dan kendaraan", async () => {
  const { cameraPlan } = await vite.ssrLoadModule("/lib/nuresq/navigation.ts");
  const shared = { coordinate: [112.63, -7.98], heading: 84, speedMps: 1.3, maneuverDistanceMeters: 120, viewportHeight: 800, reducedMotion: false };
  const walking = cameraPlan({ ...shared, cameraMode: "FOLLOW", travelMode: "walking" });
  const vehicle = cameraPlan({ ...shared, speedMps: 20, cameraMode: "FOLLOW", travelMode: "driving" });
  const overview = cameraPlan({ ...shared, cameraMode: "OVERVIEW", travelMode: "walking" });
  assert.equal(walking.bearing, 84);
  assert.equal(walking.pitch, 36);
  assert.equal(walking.offset[1], 128);
  assert.ok(vehicle.zoom < walking.zoom);
  assert.equal(overview.pitch, 8);
  assert.deepEqual(overview.offset, [0, 0]);
});

test("arrival dan maneuver berasal dari progress aktual", async () => {
  const { arrivalState, currentManeuver, maneuverDistanceCopy } = await vite.ssrLoadModule("/lib/nuresq/navigation.ts");
  const maneuvers = [
    { id: "a", kind: "left", instruction: "Belok kiri", streetName: null, distanceMeters: 200, routeDistanceFromStart: 300, coordinate: null },
    { id: "b", kind: "destination", instruction: "Tujuan", streetName: null, distanceMeters: 0, routeDistanceFromStart: 800, coordinate: null },
  ];
  const current = currentManeuver(maneuvers, 255);
  assert.equal(current.maneuver.id, "a");
  assert.equal(current.distanceMeters, 45);
  assert.equal(maneuverDistanceCopy(16), "Belok sekarang");
  assert.equal(arrivalState(70, "walking"), "ARRIVING");
  assert.equal(arrivalState(15, "walking"), "ARRIVED");
});

test("OSRM alternatives dan maneuver dipertahankan tanpa mengarang nama jalan", async () => {
  const { parseOsrmRoutes } = await vite.ssrLoadModule("/lib/nuresq/navigation-route.ts");
  const payload = {
    code: "Ok",
    routes: [0, 1].map((index) => ({
      distance: 1_000 + index * 100,
      duration: 600 + index * 60,
      geometry: { type: "LineString", coordinates: [[112.63, -7.98], [112.64, -7.97]] },
      legs: [{ steps: [
        { distance: 500, name: "", maneuver: { type: "depart", modifier: "straight", location: [112.63, -7.98] } },
        { distance: 500, name: "Jl. Semeru", maneuver: { type: "turn", modifier: "left", location: [112.64, -7.97] } },
      ] }],
    })),
  };
  const routes = parseOsrmRoutes(payload);
  assert.equal(routes.length, 2);
  assert.equal(routes[0].maneuvers[0].instruction, "Lanjut mengikuti rute");
  assert.match(routes[0].maneuvers[1].instruction, /Jl\. Semeru/);
  assert.equal(routes[0].maneuvers[1].kind, "left");
});

test("integrasi MapLibre memiliki live watch, gesture, layered route, GPS state, offline, dan responsive safeguards", async () => {
  const [map, app, tracking, camera, overlays, styles, responsive, globals, sw] = await Promise.all([
    readFile(`${root}/components/nuresq/SafetyMap.tsx`, "utf8"),
    readFile(`${root}/components/nuresq/NuResqApp.tsx`, "utf8"),
    readFile(`${root}/hooks/useNavigationTracking.ts`, "utf8"),
    readFile(`${root}/components/nuresq/navigation/NavigationRenderLoop.tsx`, "utf8"),
    readFile(`${root}/components/nuresq/navigation/NavigationOverlays.tsx`, "utf8"),
    readFile(`${root}/styles/nuresq-map.css`, "utf8"),
    readFile(`${root}/styles/nuresq-responsive.css`, "utf8"),
    readFile(`${root}/app/globals.css`, "utf8"),
    readFile(`${root}/public/sw.js`, "utf8"),
  ]);
  assert.match(tracking, /geolocation\.watchPosition/);
  assert.match(tracking, /REAL_NAVIGATION/);
  assert.match(tracking, /DEMO_NAVIGATION/);
  assert.match(app, /SIMULASI/);
  assert.match(map, /nuresq-route-casing/);
  assert.match(map, /nuresq-route-travelled/);
  assert.match(map, /nuresq-route-remaining/);
  assert.match(map, /nuresq-user-accuracy/);
  assert.match(map, /dragstart/);
  assert.match(map, /zoomstart/);
  assert.match(camera, /requestAnimationFrame/);
  assert.match(camera, /fitBounds/);
  assert.match(camera, /jumpTo/);
  // easeTo hanya sah untuk transisi RECENTERING; push GPS masuk ke smoother dan
  // render loop, bukan memicu easeTo langsung pada setiap location tick.
  assert.match(camera, /state !== "RECENTERING"[\s\S]{0,500}map\.easeTo/);
  assert.doesNotMatch(camera, /pushFix\([^)]*\)[\s\S]{0,180}map\.easeTo/);
  assert.match(overlays, /Akhiri Navigasi/);
  assert.match(overlays, /Anda telah tiba di tujuan/);
  assert.match(styles, /navigation-user-puck/);
  assert.match(styles, /route-travelled/);
  assert.match(responsive, /orientation:\s*landscape/);
  assert.match(responsive, /max-width:\s*340px/);
  assert.match(responsive, /safe-area-inset-bottom/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce/);
  assert.match(sw, /TILE_CACHE/);
  assert.match(map, /Peta cache sebagian atau belum tersedia/);
});
