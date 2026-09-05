import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectDir, "portable-dist");
const appDir = path.join(outputDir, "app");
const indexPath = path.join(appDir, "index.html");
const sourceHtml = await readFile(indexPath, "utf8");
let html = sourceHtml;

const styleMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
const scriptMatch = html.match(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/);

if (!styleMatch || !scriptMatch) {
  throw new Error("Aset portable tidak ditemukan pada hasil build.");
}

const assetPath = (reference) => path.join(appDir, reference.replace(/^\.\//, ""));
const css = await readFile(assetPath(styleMatch[1]), "utf8");
const javascript = await readFile(assetPath(scriptMatch[1]), "utf8");

const inlinedHtml = html
  .replace(styleMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(scriptMatch[0], () => `<script type="module">\n${javascript}\n</script>`);

await writeFile(indexPath, inlinedHtml);

const configScript = await readFile(path.join(projectDir, 'public', 'nuresq-config.js'), 'utf8');
const singleFileHtml = inlinedHtml
  .replace('<script src="./nuresq-config.js"></script>', () => `<script>${configScript}</script>`)
  .replace(/<link rel="manifest"[^>]*>/, "")
  .replace(/<link rel="icon"[^>]*>/, "");

await writeFile(path.join(outputDir, "nuRESQ.html"), singleFileHtml);

const launcherDir = path.join(projectDir, "portable", "launchers");
for (const filename of await readdir(launcherDir)) {
  await copyFile(path.join(launcherDir, filename), path.join(outputDir, filename));
}
await copyFile(
  path.join(projectDir, "THIRD_PARTY_NOTICES.md"),
  path.join(outputDir, "LISENSI-PIHAK-KETIGA.md"),
);

await chmod(path.join(outputDir, "BUKA-nuRESQ-macOS.command"), 0o755);
await chmod(path.join(outputDir, "BUKA-nuRESQ-Linux.sh"), 0o755);

const assetsDir = path.join(appDir, "assets");
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await writeFile(path.join(assetsDir, ".portable-build"), "Aset utama telah digabungkan ke index.html.\n");
