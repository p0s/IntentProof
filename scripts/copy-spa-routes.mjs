import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const indexHtml = join(distDir, "index.html");
const routeAliases = ["wc", "connect", "demo-dapp"];

if (!existsSync(indexHtml)) {
  throw new Error("dist/index.html does not exist. Run vite build first.");
}

for (const route of routeAliases) {
  copyFileSync(indexHtml, join(distDir, `${route}.html`));
}

console.log(`Created SPA route aliases: ${routeAliases.join(", ")}`);
