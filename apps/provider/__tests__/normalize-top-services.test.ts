import { normalizeTopServicesPayload } from "@/lib/normalize-top-services";

describe("normalizeTopServicesPayload", () => {
  it("returns legacy array payloads", () => {
    const rows = [{ service_name: "Cut", booking_count: 2, total_revenue: 90 }];
    expect(normalizeTopServicesPayload(rows)).toEqual(rows);
  });

  it("unwraps { services } envelope", () => {
    const rows = [{ service_name: "Cut", booking_count: 2, total_revenue: 90 }];
    expect(normalizeTopServicesPayload({ services: rows })).toEqual(rows);
  });

  it("returns null for empty input", () => {
    expect(normalizeTopServicesPayload(null)).toBeNull();
  });
});
