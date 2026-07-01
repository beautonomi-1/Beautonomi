#!/usr/bin/env node
/**
 * verify-documentation.mjs
 *
 * Verifies that file paths and API routes referenced in key documentation
 * files actually exist in the codebase. Used as an optional CI step and
 * in the pre-release checklist.
 *
 * Exit 0: all references resolved.
 * Exit 1: one or more references are broken (outputs a list).
 *
 * Usage:
 *   node docs/scripts/verify-documentation.mjs
 *
 * Add to CI with:
 *   - name: Verify docs references
 *     run: node docs/scripts/verify-documentation.mjs
 *     continue-on-error: true   # optional — keeps soft gate behaviour
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// Docs to check — relative to repo root.
// Each entry is a doc file + the patterns to extract file references from it.
const DOCS_TO_CHECK = [
  "docs/MANUAL_FINANCE_VALIDATION.md",
  "docs/SCALE_SLO_GATES.md",
  "docs/audits/cron-systems-audit.md",
  "docs/DOCUMENTATION_VERIFICATION.md",
  "docs/GO_LIVE_NOW.md",
  // ADMIN_CUTOVER_EXECUTION_REPORT intentionally references src/middleware.ts to document
  // that it was deliberately NOT created (Next.js 16 proxy-only architecture). Skip.
  // "docs/platform/admin-spa/ADMIN_CUTOVER_EXECUTION_REPORT.md",
  "scripts/prod/release-verify.mjs",
];

// Regex patterns that capture file-path-like tokens from doc content.
// Only match unambiguous relative source paths (must contain a '/' dir separator
// AND start with a known top-level dir). Bare filenames like `route.ts` or
// column names like `bookings.subtotal` are intentionally excluded.
const FILE_REF_PATTERN =
  /`((?:apps|src|scripts|docs|supabase|\.github|tooling)\/[a-zA-Z0-9_./\[\]@-]+\.[a-zA-Z]{1,10})`/gm;

// Route patterns like `/api/cron/...` — verify the matching route.ts exists.
const ROUTE_REF_PATTERN = /`(\/api\/[a-zA-Z0-9/_\[\]-]+)`/g;

function resolveRouteToFile(route) {
  // Map /api/cron/foo -> apps/web/src/app/api/cron/foo/route.ts
  const candidates = [
    join(ROOT, "apps", "web", "src", "app", route, "route.ts"),
    join(ROOT, "apps", "web", "src", "app", route, "route.tsx"),
    join(ROOT, "apps", "web", "src", "app", route + ".ts"),
    join(ROOT, "apps", "web", "src", "pages", route + ".ts"),
  ];
  return candidates.find(existsSync) ?? null;
}

function resolveFileRef(ref) {
  return existsSync(join(ROOT, ref));
}

async function checkDoc(docPath) {
  const fullPath = join(ROOT, docPath);
  if (!existsSync(fullPath)) {
    return { doc: docPath, missing: [], docMissing: true };
  }
  const content = await readFile(fullPath, "utf8");
  const broken = [];

  // Check file references
  for (const match of content.matchAll(FILE_REF_PATTERN)) {
    const ref = (match[1] ?? match[2] ?? "").trim();
    if (!ref || ref.length < 4) continue;
    if (!resolveFileRef(ref)) {
      broken.push({ type: "file", ref });
    }
  }

  // Check route references
  for (const match of content.matchAll(ROUTE_REF_PATTERN)) {
    const route = match[1];
    if (!route || !route.startsWith("/api/")) continue;
    if (!resolveRouteToFile(route)) {
      broken.push({ type: "route", ref: route });
    }
  }

  return { doc: docPath, missing: broken, docMissing: false };
}

console.log(`\nDocument Reference Verification — ${new Date().toISOString()}\n`);
console.log(`Root: ${ROOT}\n`);

let totalBroken = 0;

for (const docPath of DOCS_TO_CHECK) {
  const { doc, missing, docMissing } = await checkDoc(docPath);
  if (docMissing) {
    console.log(`  ⚠  ${doc} — doc file not found (skipping)`);
    continue;
  }
  if (missing.length === 0) {
    console.log(`  ✓  ${doc}`);
  } else {
    console.log(`  ✗  ${doc} — ${missing.length} broken reference(s):`);
    for (const { type, ref } of missing) {
      console.log(`       [${type}] ${ref}`);
    }
    totalBroken += missing.length;
  }
}

console.log("");

if (totalBroken > 0) {
  console.error(`FAILED: ${totalBroken} broken reference(s) found in documentation.`);
  process.exit(1);
} else {
  console.log("All documentation references verified successfully.\n");
}
