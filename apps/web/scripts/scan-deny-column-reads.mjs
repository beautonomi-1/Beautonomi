import fs from "node:fs";
import path from "node:path";

const DENY = [
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
  "time_clock_pin",
  "commission_percentage",
  "hourly_rate",
  "salary",
];
const TABLES = ["providers", "provider_staff", "provider_locations"];
const SRC = path.join(process.cwd(), "src");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function snippetUsesUserSession(snippet) {
  return /getSupabaseServer|createServerClient/.test(snippet);
}

function snippetNamesDeny(snippet) {
  if (/\.select\s*\(\s*["'`]\s*\*/.test(snippet)) return true;
  if (/\.select\s*\(\s*\)/.test(snippet)) return true;
  if (/\(\s*\*\s*\)/.test(snippet)) return true;
  if (/\.eq\s*\(\s*["']user_id["']/.test(snippet)) return true;
  for (const col of DENY) {
    if (new RegExp(`\\b${col}\\b`).test(snippet)) return true;
  }
  return false;
}

const files = walk(SRC).filter((file) => {
  const src = fs.readFileSync(file, "utf8");
  return TABLES.some((t) => src.includes(`.from("${t}")`));
});

const offenders = [];
for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  if (rel.includes("lib/supabase/admin")) continue;
  const src = fs.readFileSync(file, "utf8");
  for (const table of TABLES) {
    const re = new RegExp(String.raw`\.from\(\s*["']${table}["']\s*\)`, "g");
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const snippet = src.slice(Math.max(0, m.index - 400), m.index + 1200).split(/;\s*\n/)[0] ?? "";
      if (!snippetNamesDeny(snippet)) continue;
      if (!snippetUsesUserSession(snippet)) continue;
      {
        offenders.push(`${rel} (${table})`);
        break;
      }
    }
  }
}

console.log(offenders.join("\n"));
console.error(`TOTAL ${offenders.length}`);