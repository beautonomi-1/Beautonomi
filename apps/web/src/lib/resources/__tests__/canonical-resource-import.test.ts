import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("resource availability canonical import", () => {
  it("keeps public availability on the canonical assignment helper", () => {
    const routePath = join(
      process.cwd(),
      "src/app/api/public/providers/[slug]/availability/route.ts",
    );
    const routeSource = readFileSync(routePath, "utf8");

    expect(routeSource).toContain("@/lib/resources/assignment");
    expect(routeSource).not.toContain("@/lib/availability/resources");
  });
});
