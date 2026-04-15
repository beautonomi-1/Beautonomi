#!/usr/bin/env node
/**
 * Dependency audit while `pnpm audit` hits retired npm endpoints (HTTP 410).
 * @see https://github.com/pnpm/pnpm/issues/11265
 *
 * Collects installed package versions via `pnpm list -r --json --depth=Infinity`,
 * POSTs to the registry bulk advisory API, then exits non-zero if any advisory
 * meets or exceeds the chosen level (same idea as `npm audit --audit-level`).
 *
 * Usage: node tooling/audit/npm-audit-lockfile.mjs [low|moderate|high|critical]
 * Default: high (matches former CI: pnpm audit --audit-level=high)
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

const LEVEL_ORDER = ["low", "moderate", "high", "critical"];

const level = (process.argv[2] || "high").toLowerCase();
const thresholdIdx = LEVEL_ORDER.indexOf(level);
if (thresholdIdx === -1) {
  console.error(`Unknown level "${level}". Use: ${LEVEL_ORDER.join(", ")}`);
  process.exit(1);
}

/** @param {unknown} node @param {Map<string, Set<string>>} acc */
function collectPackageVersions(node, acc) {
  if (!node || typeof node !== "object") return;
  for (const [key, val] of Object.entries(node)) {
    if (
      key === "dependencies" ||
      key === "devDependencies" ||
      key === "optionalDependencies"
    ) {
      if (!val || typeof val !== "object") continue;
      for (const [name, meta] of Object.entries(val)) {
        if (!meta || typeof meta !== "object") continue;
        const ver = meta.version;
        if (typeof ver !== "string" || ver.startsWith("link:") || ver.startsWith("file:"))
          continue;
        if (!acc.has(name)) acc.set(name, new Set());
        acc.get(name).add(ver);
        collectPackageVersions(meta, acc);
      }
    } else {
      collectPackageVersions(val, acc);
    }
  }
}

let raw;
try {
  raw = execSync("pnpm list -r --json --depth=Infinity", {
    encoding: "utf8",
    cwd: root,
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  const err = /** @type {{ status?: number; stderr?: Buffer }} */ (e);
  console.error(err.stderr?.toString() || e);
  process.exit(err.status ?? 1);
}

const projects = JSON.parse(raw);
const versions = new Map();
for (const proj of projects) {
  collectPackageVersions(proj, versions);
}

const payload = {};
for (const [name, set] of versions) {
  payload[name] = [...set];
}

const pkgCount = Object.keys(payload).length;
console.log(`Auditing ${pkgCount} package name(s) (installed versions) against npm bulk advisories…`);

const BULK = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

const res = await fetch(BULK, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Registry returned ${res.status}: ${text.slice(0, 2000)}`);
  process.exit(1);
}

/** @type {Record<string, Array<{ severity?: string; title?: string; vulnerable_versions?: string }>>} */
const advisories = JSON.parse(text);
const names = Object.keys(advisories);

if (names.length === 0) {
  console.log("No vulnerabilities reported for the audited dependency set.");
  process.exit(0);
}

let failCount = 0;
for (const pkg of names) {
  const list = advisories[pkg];
  if (!Array.isArray(list)) continue;
  for (const adv of list) {
    const sev = (adv.severity || "low").toLowerCase();
    const idx = LEVEL_ORDER.indexOf(sev);
    if (idx === -1) continue;
    if (idx >= thresholdIdx) {
      failCount++;
      const title = adv.title || "(no title)";
      const vv = adv.vulnerable_versions || "";
      console.log(`${sev.toUpperCase().padEnd(10)} ${pkg} ${vv} — ${title}`);
    }
  }
}

if (failCount > 0) {
  console.error(`\n${failCount} advisory/advisories at or above "${level}" severity.`);
  process.exit(1);
}

console.log(`\nNo advisories at or above "${level}" severity (${names.length} package(s) had lower-severity findings only, or findings below threshold).`);
process.exit(0);
