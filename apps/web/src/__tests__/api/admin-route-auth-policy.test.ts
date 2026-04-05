import { describe, it, expect } from "vitest";
import path from "path";
import { promises as fs } from "fs";

const ADMIN_API_DIR = path.resolve(process.cwd(), "src/app/api/admin");

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listRouteFiles(fullPath);
      }
      return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
    })
  );
  return files.flat();
}

describe("Admin API auth policy", () => {
  it("does not use legacy requireRole helper in /api/admin routes", async () => {
    const routeFiles = await listRouteFiles(ADMIN_API_DIR);

    for (const filePath of routeFiles) {
      const content = await fs.readFile(filePath, "utf8");
      const relative = path.relative(path.resolve(process.cwd(), "src"), filePath);

      expect(content, `${relative} calls legacy requireRole()`).not.toMatch(
        /(^|[^A-Za-z])requireRole\s*\(/
      );
    }
  });

  it("does not permit provider roles via requireRoleInApi in /api/admin routes", async () => {
    const routeFiles = await listRouteFiles(ADMIN_API_DIR);

    for (const filePath of routeFiles) {
      const content = await fs.readFile(filePath, "utf8");
      const relative = path.relative(path.resolve(process.cwd(), "src"), filePath);

      if (!content.includes("requireRoleInApi(")) continue;
      const roleArgMatches = [...content.matchAll(/requireRoleInApi\(\s*\[([\s\S]*?)\]/g)];
      if (roleArgMatches.length === 0) continue;

      for (const match of roleArgMatches) {
        const roleListLiteral = match[1] ?? "";
        expect(
          roleListLiteral,
          `${relative} should not include provider_owner in requireRoleInApi role arrays`
        ).not.toMatch(/["']provider_owner["']/);
        expect(
          roleListLiteral,
          `${relative} should not include provider_staff in requireRoleInApi role arrays`
        ).not.toMatch(/["']provider_staff["']/);
      }
    }
  });
});
