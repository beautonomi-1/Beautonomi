import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRITICAL_ADMIN_FLOWS } from "./criticalFlows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

describe("auth guard regression (critical pages)", () => {
  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.rbac === "public"))(
    "public flow $id: LoginPage is exempt from section hooks",
    ({ pageModule, id }) => {
      const abs = join(srcRoot, pageModule);
      const src = readFileSync(abs, "utf8");
      expect(id === "login").toBe(true);
      expect(src).not.toMatch(/useAdminSectionPage/);
      expect(src).not.toMatch(/useSuperadminPage/);
    }
  );

  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.rbac === "section"))(
    "section flow $id uses useAdminSectionPage in $pageModule",
    ({ pageModule, id }) => {
      const abs = join(srcRoot, pageModule);
      const src = readFileSync(abs, "utf8");
      expect(src, `${id}: missing useAdminSectionPage`).toMatch(/useAdminSectionPage\s*\(/);
    }
  );

  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.rbac === "superadmin"))(
    "superadmin flow $id uses useSuperadminPage in $pageModule",
    ({ pageModule, id }) => {
      const abs = join(srcRoot, pageModule);
      const src = readFileSync(abs, "utf8");
      expect(src, `${id}: missing useSuperadminPage`).toMatch(/useSuperadminPage\s*\(/);
    }
  );
});
