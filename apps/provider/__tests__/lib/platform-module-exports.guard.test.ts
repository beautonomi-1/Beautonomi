import fs from "fs";
import path from "path";

/**
 * Metro resolves `foo.native.ts` / `foo.web.ts` before `foo.ts`, while TypeScript and
 * Jest resolve `foo.ts`. A runtime export missing from a platform file therefore passes
 * typecheck + tests but is `undefined` on device ("undefined is not a function").
 */
const ROOTS = [path.join(__dirname, "../../src"), path.join(__dirname, "../../app")];
const PLATFORM_SUFFIXES = [".native", ".web", ".ios", ".android"];

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
}

function runtimeExports(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z0-9_$]+)/g,
  )) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s+\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t || t.startsWith("type ")) continue;
      names.add(t.split(/\s+as\s+/).pop()!.trim());
    }
  }
  if (/export\s+default\b/.test(src)) names.add("default");
  return names;
}

describe("platform-specific module exports", () => {
  it("every runtime export of foo.ts exists in its .native/.web/.ios/.android siblings", () => {
    const files: string[] = [];
    ROOTS.filter((r) => fs.existsSync(r)).forEach((r) => walk(r, files));
    const fileSet = new Set(files);
    const problems: string[] = [];

    for (const file of files) {
      const match = file.match(/^(.*?)(\.(?:native|web|ios|android))?\.(tsx?)$/);
      if (!match || match[2]) continue;
      const base = match[1];
      const baseExports = runtimeExports(fs.readFileSync(file, "utf8"));
      for (const suffix of PLATFORM_SUFFIXES) {
        for (const ext of [".ts", ".tsx"]) {
          const sibling = `${base}${suffix}${ext}`;
          if (!fileSet.has(sibling)) continue;
          const siblingSrc = fs.readFileSync(sibling, "utf8");
          if (/export\s+\*\s+from/.test(siblingSrc)) continue;
          const siblingExports = runtimeExports(siblingSrc);
          const missing = [...baseExports].filter((name) => !siblingExports.has(name));
          if (missing.length) {
            problems.push(`${path.relative(process.cwd(), sibling)} is missing: ${missing.join(", ")}`);
          }
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
