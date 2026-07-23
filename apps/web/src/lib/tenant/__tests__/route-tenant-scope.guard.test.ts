import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

/**
 * FND-P0-003 (REM-007) — Platform-wide tenant-scope regression guard.
 *
 * Statically enforces an isolation invariant across EVERY API route: if a route
 * resolves the active tenant via `resolveTenantIdWithZaFallback`, it must then
 * actually consume that value (as a query scope, a mismatch guard, or an
 * argument to a tenant-scoped helper). A route that resolves the tenant and
 * then ignores it is the classic multi-tenant data-leak: the query runs
 * unscoped and returns another market's rows.
 *
 * This does not prove every query is scoped (that needs the behavioural tests
 * + staging), but it fails closed on the most common regression — a new/edited
 * route dropping the resolved tenant on the floor.
 */

const API_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../app/api",
);

const RESOLVER = "resolveTenantIdWithZaFallback";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

/**
 * Returns the assigned variable names for each `await resolveTenantIdWithZaFallback(...)`.
 * `null` in the array marks an occurrence whose result is used inline (not assigned).
 */
function tenantBindings(src: string): Array<string | null> {
  const bindings: Array<string | null> = [];
  const re = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*await\\s+${RESOLVER}\\b`, "g");
  let m: RegExpExecArray | null;
  const assignedAt = new Set<number>();
  while ((m = re.exec(src)) !== null) {
    bindings.push(m[1]);
    assignedAt.add(m.index);
  }
  // Inline / non-assigned usages: `await resolveTenantIdWithZaFallback(` not preceded by `= `.
  const callRe = new RegExp(`await\\s+${RESOLVER}\\s*\\(`, "g");
  while ((m = callRe.exec(src)) !== null) {
    const preceding = src.slice(Math.max(0, m.index - 40), m.index);
    if (!/[=]\s*$/.test(preceding)) bindings.push(null);
  }
  return bindings;
}

function countOccurrences(src: string, name: string): number {
  const re = new RegExp(`\\b${name}\\b`, "g");
  return (src.match(re) ?? []).length;
}

describe("tenant-scope guard (all API routes)", () => {
  const routeFiles = walk(API_DIR);

  it("finds a representative number of API routes to scan", () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  it("every route that resolves the active tenant also consumes it", () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      if (!src.includes(RESOLVER)) continue;

      const bindings = tenantBindings(src);
      if (bindings.length === 0) continue;

      // Inline usage counts as consumed.
      if (bindings.some((b) => b === null)) continue;

      // At least one assigned tenant var must be referenced beyond its declaration.
      const consumed = bindings
        .filter((b): b is string => typeof b === "string")
        .some((name) => countOccurrences(src, name) >= 2);

      if (!consumed) {
        offenders.push(path.relative(API_DIR, file).replace(/\\/g, "/"));
      }
    }

    expect(
      offenders,
      `Routes resolve the active tenant but never use it (potential cross-tenant leak):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
