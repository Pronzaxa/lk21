import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const portableRoot = path.join(root, "portable-dist");
const appHtmlPath = path.join(portableRoot, "app", "index.html");
const singleHtmlPath = path.join(portableRoot, "nuRESQ.html");

test("portable bundle opens without npm dependencies", async () => {
  const [appHtml, singleHtml, rootFiles] = await Promise.all([
    readFile(appHtmlPath, "utf8"),
    readFile(singleHtmlPath, "utf8"),
    readdir(portableRoot),
  ]);

  assert.match(appHtml, /<script type="module">/);
  assert.match(appHtml, /<style>/);
  assert.doesNotMatch(appHtml, /<script[^>]+src=/);
  assert.doesNotMatch(appHtml, /<link[^>]+rel="stylesheet"/);
  assert.match(appHtml, /basemaps\.cartocdn\.com/);
  assert.match(appHtml, /tile\.openstreetmap\.org/);
  assert.match(appHtml, /router\.project-osrm\.org/);
  assert.match(appHtml, /api\.bmkg\.go\.id/);
  assert.match(appHtml, /Scan Luka Korban/);
  assert.match(appHtml, /Peta dasar aktif/);
  assert.match(appHtml, /watchPosition/);
  assert.match(appHtml, /SIMULASI/);
  assert.match(appHtml, /ARAH TUJUAN/);
  assert.match(appHtml, /Akhiri Navigasi/);
  assert.match(appHtml, /Mencari rute baru/);
  assert.match(appHtml, /Asisten nuRESQ/);
  assert.match(appHtml, /Tersimpan di perangkat/);
  assert.match(appHtml, /Menunggu jalur pengiriman/);
  assert.match(appHtml, /Dikte suara offline belum tersedia/);
  assert.match(appHtml, /nuresq-theme/);
  assert.match(appHtml, /manifest\.webmanifest/);

  assert.doesNotMatch(singleHtml, /manifest\.webmanifest/);
  assert.doesNotMatch(singleHtml, /<script[^>]+src=/);
  assert.ok(rootFiles.includes("BUKA-nuRESQ-Windows.cmd"));
  assert.ok(rootFiles.includes("PETUNJUK-MULAI.txt"));
  assert.ok(!rootFiles.includes("package.json"));
  assert.ok(!rootFiles.includes("node_modules"));

  await Promise.all([
    access(path.join(portableRoot, "app", "sw.js")),
    access(path.join(portableRoot, "app", "manifest.webmanifest")),
    access(path.join(portableRoot, "nuresq-server.ps1")),
  ]);
});
