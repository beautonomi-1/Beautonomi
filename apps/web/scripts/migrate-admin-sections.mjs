/**
 * One-time migration: replace requireRoleInApi(["superadmin"], request) and
 * requireRole(["superadmin"]) with requireAdminSection(SECTION, request) in all admin API routes.
 * Run from apps/web: node scripts/migrate-admin-sections.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminApiRoot = path.join(__dirname, "..", "src", "app", "api", "admin");

const SECTION_CONST = {
  overview: "ADMIN_SECTION_OVERVIEW",
  providers_operations: "ADMIN_SECTION_PROVIDERS_OPERATIONS",
  finance: "ADMIN_SECTION_FINANCE",
  users_trust: "ADMIN_SECTION_USERS_TRUST",
  content_catalog: "ADMIN_SECTION_CONTENT_CATALOG",
  ecommerce: "ADMIN_SECTION_ECOMMERCE",
  marketing_comms: "ADMIN_SECTION_MARKETING_COMMS",
  integrations_dev: "ADMIN_SECTION_INTEGRATIONS_DEV",
  operations: "ADMIN_SECTION_OPERATIONS",
  platform_config: "ADMIN_SECTION_PLATFORM_CONFIG",
};

function getSectionFromRelativePath(relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (first === "export" && second) {
    if (second === "audit-logs" || second === "users") return "users_trust";
    if (second === "analytics") return "overview";
    if (second === "finance") return "finance";
    if (second === "bookings" || second === "providers" || second === "reviews") return "providers_operations";
  }
  if (first === "settings" || first === "control-plane" || first === "feature-flags" || first === "custom-fields" || first === "app-version" || first === "referrals" || first === "maintenance" || first === "nav-counts" || first === "search") return "platform_config";
  if (["dashboard", "gods-eye", "analytics", "reports", "activity"].includes(first)) return "overview";
  if (["providers", "staff", "bookings", "reviews", "disputes", "user-reports", "refunds", "support-tickets"].includes(first)) return "providers_operations";
  if (["finance", "payouts", "fees", "taxes", "plans", "provider-subscriptions", "subscription-revenue", "subscription-plans", "subscription-metrics", "billing", "pricing-plans", "invoices", "payments"].includes(first)) return "finance";
  if (["users", "verifications", "audit-logs"].includes(first)) return "users_trust";
  if (["content", "catalog", "explore"].includes(first)) return "content_catalog";
  if (["product-orders", "product-returns", "ecommerce"].includes(first)) return "ecommerce";
  if (["promotions", "loyalty", "gamification", "gift-cards", "notifications", "broadcast", "automations", "notification-templates"].includes(first)) return "marketing_comms";
  if (["webhooks", "api-keys", "integrations", "mapbox", "service-zones", "iso-codes", "platform-zones", "travel-fees"].includes(first)) return "integrations_dev";
  if (["system-health", "monitoring", "security", "safety"].includes(first)) return "operations";
  return "platform_config";
}

// Second param unused but kept for recursive call signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function collectRoutes(dir, _base = "") {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(adminApiRoot, full).replace(/\\/g, "/");
    if (e.isDirectory()) {
      files = files.concat(collectRoutes(full, rel));
    } else if (e.name === "route.ts") {
      files.push(rel);
    }
  }
  return files;
}

const routeFiles = collectRoutes(adminApiRoot);
let changed = 0;

for (const rel of routeFiles) {
  const fullPath = path.join(adminApiRoot, rel);
  const dir = path.dirname(rel);
  const section = getSectionFromRelativePath(dir);
  const sectionConst = SECTION_CONST[section];
  if (!sectionConst) continue;

  let content = fs.readFileSync(fullPath, "utf8");
  const original = content;

  if (!content.includes("superadmin") && !content.includes("requireRole")) continue;

  const needRequireAdminSection = content.includes("requireRoleInApi") && content.includes("superadmin") || content.includes("requireRole([\"superadmin\"])") || content.includes("requireRole(['superadmin'])");
  if (!needRequireAdminSection) continue;

  content = content.replace(/requireRoleInApi\(\s*\[["']superadmin["']\],\s*request\s*\)/g, `requireAdminSection(${sectionConst}, request)`);
  content = content.replace(/const\s+\{\s*user\s*\}\s*=\s*await\s+requireRoleInApi\(\s*\[["']superadmin["']\],\s*request\s*\)/g, `const { user } = await requireAdminSection(${sectionConst}, request)`);
  content = content.replace(/const\s+auth\s*=\s*await\s+requireRoleInApi\(\s*\[["']superadmin["']\],\s*request\s*\)/g, `const { user } = await requireAdminSection(${sectionConst}, request)`);
  content = content.replace(/const\s+auth\s*=\s*await\s+requireRole\(\s*\[["']superadmin["']\]\s*\)/g, `const { user } = await requireAdminSection(${sectionConst}, request)`);

  content = content.replace(/\bauth\.user\b/g, "user");

  if (content.includes("requireAdminSection") && !content.includes(sectionConst)) {
    content = content.replace(/requireAdminSection\(\s*request\s*\)/g, `requireAdminSection(${sectionConst}, request)`);
  }

  if (content.includes("requireAdminSection") && !content.includes('admin-sections')) {
    const apiHelpersImport = content.match(/from\s+["']@\/lib\/supabase\/api-helpers["'];?/);
    if (apiHelpersImport) {
      content = content.replace(
        /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']@\/lib\/supabase\/api-helpers["'];?/,
        (m, imports) => {
          const hasRequireAdminSection = imports.includes("requireAdminSection");
          let newImports = hasRequireAdminSection ? imports : imports.replace("requireRoleInApi", "requireAdminSection").replace("requireRoleInApi,", "requireAdminSection,").replace(", requireRoleInApi", ", requireAdminSection");
          if (!hasRequireAdminSection && !newImports.includes("requireAdminSection")) newImports = "requireAdminSection, " + newImports.trim();
          return `import { ${newImports} } from "@/lib/supabase/api-helpers";`;
        }
      );
    }
    const idx = content.indexOf("from \"@/lib/supabase/api-helpers\"");
    if (idx !== -1) {
      const lineEnd = content.indexOf("\n", idx);
      if (!content.includes("admin-sections")) {
        content = content.slice(0, lineEnd) + "\nimport { " + sectionConst + " } from \"@/lib/admin-sections\";" + content.slice(lineEnd);
      }
    }
  }

  const needSectionImport = content.includes("requireAdminSection") && content.includes(sectionConst) && !content.includes("admin-sections");
  if (needSectionImport) {
    const lastImport = content.lastIndexOf('from "');
    const insertIdx = content.indexOf("\n", lastImport) + 1;
    if (insertIdx > 0 && !content.includes("admin-sections")) {
      content = content.slice(0, insertIdx) + "import { " + sectionConst + " } from \"@/lib/admin-sections\";\n" + content.slice(insertIdx);
    }
  }

  if (content.includes("requireRoleInApi") && content.includes("superadmin")) {
    content = content.replace(/requireRoleInApi/g, "requireAdminSection");
    if (!content.includes(sectionConst)) {
      content = content.replace(/requireAdminSection\(\s*request\s*\)/g, `requireAdminSection(${sectionConst}, request)`);
    }
    if (!content.includes("admin-sections")) {
      const firstImport = content.match(/\nimport\s+\{[^}]+\}\s+from\s+["']@\/lib\/supabase\/api-helpers["']/);
      if (firstImport) {
        content = content.replace(/(\nimport\s+\{[^}]+\}\s+from\s+["']@\/lib\/supabase\/api-helpers["'];?)/, "$1\nimport { " + sectionConst + " } from \"@/lib/admin-sections\";");
      }
    }
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    changed++;
    console.log(rel, "->", section);
  }
}

console.log("Done. Changed", changed, "files.");
