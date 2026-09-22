import { describe, expect, it } from "vitest";
import { formatBookingServicesLineForTemplates } from "../notification-service";

describe("formatBookingServicesLineForTemplates", () => {
  it("uses walk-in display names from mapped booking.services", () => {
    const line = formatBookingServicesLineForTemplates({
      services: [
        {
          service: {
            name: "Bridal glam",
          },
        },
        {
          service: {
            name: "Haircut",
          },
        },
      ],
    });
    expect(line).toBe("Bridal glam, Haircut");
  });

  it("prefixes package name when package discount applied", () => {
    const line = formatBookingServicesLineForTemplates({
      package: { name: "Bridal bundle" },
      package_id: "pkg-1",
      discount_amount: 50,
      services: [{ service: { name: "Bridal glam" } }],
    });
    expect(line).toBe("Package: Bridal bundle — Bridal glam");
  });
});
