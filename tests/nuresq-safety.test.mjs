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

after(async () => {
  await vite.close();
});

test("triage deterministik membedakan perdarahan aktif dan terkendali", async () => {
  const { calculateRisk } = await vite.ssrLoadModule("/lib/nuresq/safety.ts");
  const baseDraft = {
    type: "Darurat Medis",
    victimCount: 1,
    mobilityLimited: false,
    waterLevel: 0,
    injuryAssessment: null,
  };

  const active = calculateRisk({ ...baseDraft, description: "Darah masih keluar dan tidak berhenti" });
  const controlled = calculateRisk({ ...baseDraft, description: "Perdarahan sudah berhenti dan terkendali" });

  assert.equal(active.level, "KRITIS");
  assert.equal(active.ruleCode, "UNCONTROLLED_BLEEDING");
  assert.notEqual(controlled.level, "KRITIS");
});

test("laporan banjir contoh tetap prioritas tinggi", async () => {
  const { calculateRisk } = await vite.ssrLoadModule("/lib/nuresq/safety.ts");
  const result = calculateRisk({
    type: "Banjir",
    description: "Saya dan ibu terjebak, ada 2 orang dan ibu tidak bisa berjalan",
    victimCount: 2,
    mobilityLimited: true,
    waterLevel: 90,
    injuryAssessment: null,
  });

  assert.equal(result.level, "PRIORITAS TINGGI");
});

test("scan luka memaksa prioritas kritis hanya dari tanda bahaya terkonfirmasi", async () => {
  const [{ calculateRisk }, { evaluateInjuryAssessment }] = await Promise.all([
    vite.ssrLoadModule("/lib/nuresq/safety.ts"),
    vite.ssrLoadModule("/lib/nuresq/injury-scan.ts"),
  ]);
  const assessment = evaluateInjuryAssessment(
    { brightness: 120, contrast: 42, redPixelRatio: 0.12, quality: "cukup" },
    { uncontrolledBleeding: true, unconscious: false, breathingDifficulty: false, suspectedFracture: false },
    new Date("2026-08-29T00:00:00Z"),
  );
  const result = calculateRisk({
    type: "Darurat Medis",
    description: "Ada luka pada tangan",
    victimCount: 1,
    mobilityLimited: false,
    waterLevel: 0,
    injuryAssessment: assessment,
  });

  assert.equal(assessment.priority, "kritis");
  assert.equal(result.level, "KRITIS");
  assert.equal(result.ruleCode, "INJURY_RED_FLAG");
});

test("pemeriksaan lokasi menolak lompatan yang tidak masuk akal", async () => {
  const { classifyLocationFix, locationFreshness } = await vite.ssrLoadModule("/lib/nuresq/location.ts");
  const previous = { latitude: -7.9786, longitude: 112.6308, accuracy: 10, timestamp: 1_000 };
  const impossible = { latitude: -6.1754, longitude: 106.8272, accuracy: 8, timestamp: 11_000 };
  const nearby = { latitude: -7.9787, longitude: 112.6309, accuracy: 12, timestamp: 11_000 };

  assert.equal(classifyLocationFix(impossible, previous, 11_000), "GPS_SUSPICIOUS");
  assert.equal(classifyLocationFix(nearby, previous, 11_000), "GPS_TRUSTED");
  assert.equal(classifyLocationFix({ ...nearby, accuracy: 240 }, previous, 11_000), "GPS_LOW_ACCURACY");
  assert.equal(classifyLocationFix({ ...nearby, timestamp: 1_000 }, null, 40 * 60_000), "GPS_STALE");
  assert.equal(locationFreshness(1_000, 61_000), "FRESH");
  assert.equal(locationFreshness(1_000, 6 * 60_000), "AGING");
  assert.equal(locationFreshness(1_000, 20 * 60_000), "STALE");
  assert.equal(locationFreshness(1_000, 40 * 60_000), "VERY_STALE");
});

test("negasi, riwayat, dan pemulihan menghasilkan fakta terstruktur", async () => {
  const { parseSafetyFacts, detectSafetySignals } = await vite.ssrLoadModule("/lib/nuresq/safety.ts");
  const cases = [
    ["korban pingsan", "unconscious", true, false],
    ["korban tidak pingsan", "unconscious", false, false],
    ["korban tadi sempat pingsan", "unconscious", null, true],
    ["korban sudah sadar", "unconscious", false, true],
    ["tidak ada perdarahan", "bleeding", false, false],
    ["darah tidak berhenti", "bleeding", true, false],
    ["darah sudah berhenti", "bleeding", false, true],
    ["air naik", "risingWater", true, false],
    ["air tidak naik", "risingWater", false, false],
    ["air tadi naik tetapi sekarang stabil", "risingWater", false, true],
  ];
  for (const [text, key, current, historical] of cases) {
    const fact = parseSafetyFacts(text)[key];
    assert.equal(fact.current, current, text);
    assert.equal(fact.historical, historical, text);
  }
  assert.equal(detectSafetySignals("korban tidak pingsan dan tidak ada perdarahan").length, 0);
  assert.ok(detectSafetySignals("darah tidak berhenti").some((item) => item.id === "UNCONTROLLED_BLEEDING"));
});

test("jumlah korban hanya diisi dari bukti eksplisit", async () => {
  const { parseVictimCount } = await vite.ssrLoadModule("/lib/nuresq/safety.ts");
  const cases = [
    ["saya sendiri", 1],
    ["saya bersama ibu", 2],
    ["ibu sudah dievakuasi, saya sendiri", 1],
    ["ada tiga orang", 3],
    ["kami berdua", 2],
    ["saya dan dua anak", 3],
    ["saya mencari ibu saya", null],
    ["ibu saya tinggal di Jakarta", null],
  ];
  for (const [text, expected] of cases) assert.equal(parseVictimCount(text), expected, text);
});

test("tanpa GPS tidak ada objek lokasi korban dan pusat peta tetap terpisah", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(`${root}/hooks/useTrustedLocation.ts`, "utf8"));
  const { MAP_DEFAULT_CENTER } = await vite.ssrLoadModule("/lib/nuresq/location.ts");
  assert.deepEqual(MAP_DEFAULT_CENTER, { latitude: -7.9786, longitude: 112.6308, label: "Kota Malang" });
  assert.match(source, /useState<LocationSnapshot \| null>\(null\)/);
  assert.doesNotMatch(source, /DEFAULT_LOCATION/);
});
