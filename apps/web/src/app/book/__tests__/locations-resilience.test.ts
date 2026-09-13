import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const flowSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/OnlineBookingFlowNew.tsx"),
  "utf8",
);
const pageSrc = fs.readFileSync(
  path.resolve(__dirname, "../[providerSlug]/page.tsx"),
  "utf8",
);

describe("booking location resilience", () => {
  it("seeds locations from SSR and does not fail the load if the public provider GET throws", () => {
    expect(pageSrc).toContain("getPublicProviderBookingSeed");
    expect(flowSrc).toContain("normalizeBookingLocations(provider.locations)");
    expect(flowSrc).toMatch(
      /\/api\/public\/providers\/\$\{provider\.slug\}`[\s\S]{0,120}\.catch\(\(\) => \(\{ data: \{ locations: seedLocs \}/,
    );
  });
});
