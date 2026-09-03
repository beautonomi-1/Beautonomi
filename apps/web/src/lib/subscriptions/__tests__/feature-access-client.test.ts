import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("getFeatureAccessClient", () => {
  it("is exported from feature-access.ts and always takes a request", () => {
    const src = readFileSync(
      resolve(__dirname, "../feature-access.ts"),
      "utf8",
    );
    expect(src).toContain("export async function getFeatureAccessClient");
    expect(src).toContain("getSupabaseServer(request)");
    expect(src).toMatch(/Always pass the route `request`/);
  });
});
