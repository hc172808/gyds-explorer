import { readFile, writeFile } from "node:fs/promises";

const serverPath = process.argv[2];
if (!serverPath) {
  throw new Error("Usage: node install-legacy-auto-update-hook.mjs <api-server.js>");
}

const hook = 'require(path.resolve(__dirname, "../scripts/legacy-auto-update-routes.cjs"))({ app, pool, requireAdmin });';
const source = await readFile(serverPath, "utf8");
if (source.includes("legacy-auto-update-routes.cjs")) {
  process.stdout.write("Automatic update API hook is already installed.\n");
  process.exit(0);
}

const marker = "app.listen(PORT,";
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) {
  throw new Error(`Could not locate ${marker} in ${serverPath}; refusing to modify an unknown API server.`);
}

const updated = `${source.slice(0, markerIndex)}${hook}\n\n${source.slice(markerIndex)}`;
await writeFile(serverPath, updated, "utf8");
process.stdout.write("Installed automatic update and API-root routes in the legacy API server.\n");
