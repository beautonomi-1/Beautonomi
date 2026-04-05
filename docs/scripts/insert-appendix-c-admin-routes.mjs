import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SPEC = join(ROOT, "INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md");
const ROUTES_FILE = join(ROOT, "_admin_api_routes_snapshot.txt");
const MARKER = "## Related docs";

const routes = readFileSync(ROUTES_FILE, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const counts = new Map();
for (const r of routes) {
  const rest = r.replace(/^\/api\/admin\/?/, "");
  const first = rest ? rest.split("/")[0] : "(root)";
  counts.set(first, (counts.get(first) ?? 0) + 1);
}

const rows = [...counts.entries()].sort((a, b) =>
  a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
);
let c1 =
  "| Prefix | Route files |\n|--------|-------------|\n" +
  rows.map(([name, c]) => `| \`${name}\` | ${c} |`).join("\n") +
  `\n| **Total** | **${routes.length}** |`;

const appendix = `## Appendix C — \`/api/admin\` route inventory (generated)

**Purpose:** Single checklist of **every** Next.js Route Handler under \`apps/web/src/app/api/admin/**/route.ts\` for tenancy migration, security review, and **§11.3.1** audit coverage.

**Normative behavior:** Does **not** change **§11.3.1** — each path **must** still resolve **\`tenant_id\`** (or **explicit \`global_superadmin\`** cross-tenant rules) per NN-2 and §8.6.

**Regenerate** (repository root):

\`\`\`powershell
$adminRoot = (Resolve-Path 'apps\\web\\src\\app\\api\\admin').Path
Get-ChildItem -LiteralPath $adminRoot -Recurse -Filter 'route.ts' | ForEach-Object {
  $dir = $_.Directory.FullName
  $sub = $dir.Substring($adminRoot.Length).Replace('\\','/').TrimStart('/')
  if ($sub) { '/api/admin/' + $sub } else { '/api/admin' }
} | Sort-Object -Unique | Set-Content -Encoding utf8 docs/_admin_api_routes_snapshot.txt
\`\`\`

\`\`\`bash
node docs/scripts/insert-appendix-c-admin-routes.mjs
\`\`\`

**Conventions:** \`[id]\`, \`[code]\`, \`[txId]\`, etc. are **dynamic segments** (Next.js); actual HTTP paths use concrete values.

### C.1 Count by top-level segment

${c1}

### C.2 Full path list (alphabetical)

\`\`\`text
${routes.join("\n")}
\`\`\`

---
`;

let text = readFileSync(SPEC, "utf8");
if (!text.includes(MARKER)) throw new Error("Marker not found");
if (text.includes("## Appendix C — `/api/admin`")) {
  const start = text.indexOf("## Appendix C — `/api/admin`");
  const end = text.indexOf(MARKER, start);
  text = text.slice(0, start) + appendix + "\n" + text.slice(end);
} else {
  text = text.replace(MARKER, appendix + "\n" + MARKER);
}
writeFileSync(SPEC, text, "utf8");
console.log(`Appendix C updated: ${routes.length} routes`);
