#!/usr/bin/env node
// Fails CI if any apps/web/src/app/api/admin/**/route.ts is missing from
// docs/admin-api-route-taxonomy.csv (contract alignment guardrail).
// Run from repo root: node apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", "..");
const adminApiRoot = join(repoRoot, "apps", "web", "src", "app", "api", "admin");
const csvPath = join(repoRoot, "docs", "admin-api-route-taxonomy.csv");

function collectApiPaths(dir, base, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      collectApiPaths(p, base, out);
    } else if (ent.name === "route.ts" || ent.name === "route.tsx") {
      const rel = relative(base, dir);
      const posix = rel.split(sep).join("/");
      const apiPath = "/api/admin" + (posix ? "/" + posix : "");
      out.push(apiPath);
    }
  }
}

function loadTaxonomyPaths() {
  const text = readFileSync(csvPath, "utf8");
  const paths = new Set();
  for (const line of text.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const col = trimmed.split(",")[0]?.replace(/^"|"$/g, "") ?? "";
    if (col.startsWith("/api/admin")) paths.add(col);
  }
  return paths;
}

const fromFs = [];
collectApiPaths(adminApiRoot, adminApiRoot, fromFs);
const taxonomy = loadTaxonomyPaths();

const missingInCsv = [...new Set(fromFs)].filter((p) => !taxonomy.has(p)).sort();

if (missingInCsv.length > 0) {
  console.error(
    "[admin-api-taxonomy] These route handlers are not listed in docs/admin-api-route-taxonomy.csv:\n" +
      missingInCsv.map((p) => `  - ${p}`).join("\n") +
      "\n\nAdd rows (or run docs/scripts/generate-admin-route-taxonomy.mjs if applicable) and update ADMIN_API_PARITY_MATRIX.md when the SPA consumes the route."
  );
  process.exit(1);
}

console.log(`[admin-api-taxonomy] OK — ${fromFs.length} admin API route files match taxonomy entries.`);
