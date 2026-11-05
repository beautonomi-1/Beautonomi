import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Text of every `.from("providers")` call up to the end of its select/insert/update argument. */
function providerQuerySnippets(src: string): string[] {
  const snippets: string[] = [];
  const re = /\.from\(\s*["']providers["']\s*\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    snippets.push(src.slice(m.index, m.index + 1500).split(/;\s*\n/)[0] ?? "");
  }
  return snippets;
}

describe("providers queries only use columns/relationships that exist", () => {
  const files = sourceFiles(SRC);

  it("never selects or writes providers.country_code (column does not exist)", () => {
    const offenders = files
      .filter((file) =>
        providerQuerySnippets(readFileSync(file, "utf8")).some((s) =>
          /\.(select|insert|update|upsert)\([\s\S]*?\bcountry_code\b/.test(s),
        ),
      )
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("disambiguates the providers -> users embed (user_id and tax_rate_override_by both reference users)", () => {
    for (const rel of ["app/api/public/providers/[slug]/route.ts", "lib/data/getPublicProviderDetail.ts"]) {
      const src = readFileSync(join(SRC, rel), "utf8");
      expect(src).toContain("users!providers_user_id_fkey(include_in_search_engines)");
      expect(src).not.toMatch(/[\s,]users\(include_in_search_engines\)/);
    }
  });
});
