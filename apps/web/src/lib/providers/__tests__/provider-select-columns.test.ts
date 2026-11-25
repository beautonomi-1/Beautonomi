import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "..");

const DENY_COLUMNS = [
  "phone",
  "email",
  "user_id",
  "billing_phone",
  "billing_email",
  "billing_address",
  "subscription_plan_id",
  "subscription_status",
  "subscription_expires_at",
  "vat_number",
  "is_vat_registered",
  "stripe_connect_account_id",
  "commission_override",
  "total_paid_out",
  "tax_rate_override_percent",
  "tax_rate_override_by",
  "tax_rate_override_at",
  "tax_rate_override_reason",
  "registered_business_name",
  "business_registration_number",
  "business_registration_country",
  "time_clock_pin",
  "commission_percentage",
  "commission_enabled",
  "commission_rate",
  "service_commission_rate",
  "product_commission_rate",
  "hourly_rate",
  "salary",
] as const;

const PRIVATE_TABLES = ["providers", "provider_staff", "provider_locations"] as const;

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

function sessionClientNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const match of src.matchAll(
    /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*await\s+getSupabaseServer\b/g,
  )) {
    names.add(match[1]);
  }
  if (src.includes("createServerClient")) names.add("supabase");
  return names;
}

/** The method chain for one `.from(table)` call, stopping before the next query. */
function fromChain(src: string, at: number): string {
  const rest = src.slice(at, at + 800);
  const nextFrom = rest.slice(1).search(/\.from\s*\(/);
  const cut = nextFrom === -1 ? rest.length : nextFrom + 1;
  return rest.slice(0, cut).split(/;\s*\n/)[0] ?? "";
}

function snippetNamesDenyColumn(snippet: string): boolean {
  if (/\.select\s*\(\s*["'`]\s*\*/.test(snippet)) return true;
  if (/\.select\s*\(\s*\)/.test(snippet)) return true;
  if (/\(\s*\*\s*\)/.test(snippet)) return true;
  if (/\.eq\s*\(\s*["']user_id["']/.test(snippet)) return true;
  for (const col of DENY_COLUMNS) {
    const colRe = new RegExp(`\\b${col}\\b`);
    if (colRe.test(snippet)) return true;
  }
  return false;
}

describe("providers queries only use columns/relationships that exist", () => {
  const allFiles = sourceFiles(SRC);
  const files = allFiles.filter((file) => {
    const src = readFileSync(file, "utf8");
    return PRIVATE_TABLES.some(
      (table) => src.includes(`.from("${table}")`) || src.includes(`.from('${table}')`),
    );
  });

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

  it("does not read deny-list columns on providers or staff through the user session without admin", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (rel.includes("lib/supabase/admin")) continue;

      const sessionClients = sessionClientNames(src);
      if (sessionClients.size === 0) continue;

      for (const table of PRIVATE_TABLES) {
        const re = new RegExp(`\\b([A-Za-z0-9_]+)\\s*\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");
        for (let match = re.exec(src); match; match = re.exec(src)) {
          if (!sessionClients.has(match[1])) continue;
          const snippet = fromChain(src, match.index);
          if (!snippetNamesDenyColumn(snippet)) continue;
          offenders.push(`${rel} (${table})`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});