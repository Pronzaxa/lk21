import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("layout menjaga safe area, dialog, peta, dan CTA pada mobile", async () => {
  const [globals, responsive, map, sos] = await Promise.all([
    readFile(`${root}/app/globals.css`, "utf8"),
    readFile(`${root}/styles/nuresq-responsive.css`, "utf8"),
    readFile(`${root}/styles/nuresq-map.css`, "utf8"),
    readFile(`${root}/styles/nuresq-sos.css`, "utf8"),
  ]);
  assert.match(globals, /min-width:\s*320px/);
  assert.match(globals, /overflow-x:\s*hidden/);
  assert.match(responsive, /bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(responsive, /padding:\s*19px 17px 116px/);
  assert.match(responsive, /height:\s*calc\(100dvh - 70px - 94px - env\(safe-area-inset-bottom\)\)/);
  assert.match(responsive, /\.route-panel\.sheet-full \{ max-height: calc\(100% - 14px\)/);
  assert.match(responsive, /\.sos-dialog \{ max-height: calc\(100dvh - 12px\)/);
  assert.match(sos, /width:\s*min\(560px,calc\(100vw - 24px\)\)/);
  assert.match(map, /\.travel-mode-control/);
});

test("desktop dan tablet tidak memakai layout mobile yang diperbesar", async () => {
  const responsive = await readFile(`${root}/styles/nuresq-responsive.css`, "utf8");
  const core = await readFile(`${root}/styles/nuresq-core.css`, "utf8");
  assert.match(responsive, /max-width: 1180px\) and \(min-width: 960px/);
  assert.match(responsive, /\.desktop-sidebar \{ width: 210px/);
  assert.match(core, /\.home-layout/);
  assert.match(core, /grid-template-columns/);
});
