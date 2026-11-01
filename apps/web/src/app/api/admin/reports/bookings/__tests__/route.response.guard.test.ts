import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(__dirname, "..", "route.ts"), "utf8");

describe("admin bookings report route response contract", () => {
  it("exposes counts and GMV fields consumed by admin-web", () => {
    expect(routeSource).toContain("completedBookings: completed");
    expect(routeSource).toContain("cancelledBookings: cancelled");
    expect(routeSource).toContain("noShowBookings: noShow");
    expect(routeSource).toContain("completed_gmv:");
    expect(routeSource).toContain("channelBasisNote");
    expect(routeSource).toContain("MAX_BOOKINGS_FOR_REPORT");
    expect(routeSource).toContain(".lte('scheduled_at', endDate.toISOString())");
  });
});
