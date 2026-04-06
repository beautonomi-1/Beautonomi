import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRITICAL_ADMIN_FLOWS } from "./criticalFlows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appTsxPath = join(__dirname, "../App.tsx");

describe("admin route smoke (critical flows)", () => {
  const appSource = readFileSync(appTsxPath, "utf8");

  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.appPath !== "login"))(
    "App registers route path $appPath ($id)",
    ({ appPath, id }) => {
      const escaped = appPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`path=["']${escaped}["']`);
      expect(appSource, `missing <Route path="${appPath}" /> for ${id}`).toMatch(re);
    }
  );

  it("App registers login route", () => {
    expect(appSource).toMatch(/path=["']login["']/);
  });
});
