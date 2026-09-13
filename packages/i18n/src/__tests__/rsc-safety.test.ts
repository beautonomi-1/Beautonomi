import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..");

const IMPORT_RE =
  /(?:import\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+|export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+)["']([^"']+)["']/g;

function resolveLocalImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function collectLocalModules(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveLocalImport(file, match[1]!);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
}

function hasTopLevelReactI18nextImport(source: string): boolean {
  return /(?:^|\n)\s*(?:import|export)\s+[^;]*from\s+["']react-i18next["']/.test(source);
}

describe("rsc-safety", () => {
  it("client.ts is a client boundary", () => {
    const clientPath = path.join(srcRoot, "client.ts");
    const source = fs.readFileSync(clientPath, "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("index.ts import graph does not pull react-i18next except via client.ts", () => {
    const indexPath = path.join(srcRoot, "index.ts");
    const clientPath = path.join(srcRoot, "client.ts");
    const modules = collectLocalModules(indexPath);

    const offenders: string[] = [];
    for (const file of modules) {
      if (file === clientPath) continue;
      const source = fs.readFileSync(file, "utf8");
      if (hasTopLevelReactI18nextImport(source)) {
        offenders.push(path.relative(srcRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("index.ts re-exports react-i18next hooks through ./client", () => {
    const indexSource = fs.readFileSync(path.join(srcRoot, "index.ts"), "utf8");
    expect(indexSource).toMatch(/export\s+\{\s*useTranslation,\s*I18nextProvider\s*\}\s+from\s+"\.\/client"/);
    expect(hasTopLevelReactI18nextImport(indexSource)).toBe(false);
  });
});
