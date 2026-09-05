import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => vite.close());

test("parser BMKG menghasilkan alert beratribusi dan koordinat nyata", async () => {
  const { parseBmkgEarthquake } = await vite.ssrLoadModule("/lib/nuresq/live-hazards.ts");
  const alerts = parseBmkgEarthquake({
    Infogempa: {
      gempa: {
        DateTime: "2026-08-29T00:50:06+00:00",
        Coordinates: "-7.27,109.65",
        Magnitude: "5.2",
        Kedalaman: "7 km",
        Wilayah: "17 km barat laut Banjarnegara",
        Potensi: "Tidak berpotensi tsunami",
      },
    },
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].sourceName, "BMKG");
  assert.equal(alerts[0].severity, "warning");
  assert.equal(alerts[0].latitude, -7.27);
  assert.equal(alerts[0].longitude, 109.65);
});

test("parser cuaca BMKG memakai lokasi dan tidak mengarang peringatan", async () => {
  const { parseBmkgWeather } = await vite.ssrLoadModule("/lib/nuresq/live-hazards.ts");
  const alerts = parseBmkgWeather({
    lokasi: { adm4: "35.73.05.1011", desa: "Lowokwaru", lat: -7.957, lon: 112.632 },
    data: [{ cuaca: [[{
      datetime: "2099-08-29T04:00:00Z",
      weather_desc: "Cerah",
      t: 28,
      tp: 0,
      ws: 7,
    }]] }],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "advisory");
  assert.match(alerts[0].title, /Lowokwaru/);
  assert.match(alerts[0].advice, /Belum ada sinyal/);
  assert.equal(alerts[0].freshness, "FRESH");
});

test("wilayah BMKG tidak memiliki fallback Lowokwaru yang diam-diam", async () => {
  const { readFile } = await import("node:fs/promises");
  const [hook, route] = await Promise.all([
    readFile(`${root}/hooks/useLiveHazards.ts`, "utf8"),
    readFile(`${root}/app/api/hazards/route.ts`, "utf8"),
  ]);
  assert.doesNotMatch(hook, /adm4=35\.73\.05\.1011/);
  assert.doesNotMatch(route, /DEFAULT_ADM4/);
  assert.match(route, /Wilayah cuaca belum dipilih/);
});
