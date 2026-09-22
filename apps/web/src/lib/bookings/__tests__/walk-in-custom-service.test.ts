import { describe, expect, it } from "vitest";
import {
  bookingServiceCustomizationForApi,
  isCustomServicePlaceholderId,
  isWalkInCustomServiceInput,
  mapProviderBookingServiceLineForApi,
  resolveBookingServiceDisplayName,
  walkInCustomServiceLabel,
} from "../walk-in-custom-service";

const CATALOG_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("isWalkInCustomServiceInput", () => {
  it("does not treat mobile catalog uuid plus name as custom", () => {
    expect(
      isWalkInCustomServiceInput({
        service_id: CATALOG_UUID,
        name: "Haircut",
      }),
    ).toBe(false);
  });

  it("treats isCustom and customName as custom", () => {
    expect(isWalkInCustomServiceInput({ isCustom: true, service_id: CATALOG_UUID })).toBe(true);
    expect(isWalkInCustomServiceInput({ customName: "Bridal", service_id: CATALOG_UUID })).toBe(
      true,
    );
  });

  it("treats custom- and custom: placeholder ids as custom", () => {
    expect(isWalkInCustomServiceInput({ serviceId: "custom-1", serviceName: "Bridal" })).toBe(
      true,
    );
    expect(isWalkInCustomServiceInput({ service_id: "custom:line-2", name: "X" })).toBe(true);
  });
});

describe("isCustomServicePlaceholderId", () => {
  it("matches only custom- and custom: prefixes", () => {
    expect(isCustomServicePlaceholderId("custom-abc")).toBe(true);
    expect(isCustomServicePlaceholderId("custom:abc")).toBe(true);
    expect(isCustomServicePlaceholderId(CATALOG_UUID)).toBe(false);
  });
});

describe("walkInCustomServiceLabel", () => {
  it("prefers customName then name then serviceName", () => {
    expect(walkInCustomServiceLabel({ customName: "Bridal" })).toBe("Bridal");
    expect(walkInCustomServiceLabel({ name: "From name" })).toBe("From name");
    expect(walkInCustomServiceLabel({ serviceName: "From serviceName" })).toBe("From serviceName");
  });
});

describe("resolveBookingServiceDisplayName", () => {
  const walkInJson = JSON.stringify({
    display_name: "Bridal glam",
    is_walk_in_custom: true,
  });

  it("uses display_name only for walk-in JSON", () => {
    expect(
      resolveBookingServiceDisplayName({
        offeringTitle: "Walk-in custom service",
        customization: walkInJson,
      }),
    ).toBe("Bridal glam");
  });

  it("keeps catalog title when customization is a plain note", () => {
    expect(
      resolveBookingServiceDisplayName({
        offeringTitle: "Haircut",
        customization: "Extra long layers",
      }),
    ).toBe("Haircut");
  });
});

describe("bookingServiceCustomizationForApi", () => {
  it("returns plain notes and hides walk-in JSON", () => {
    expect(bookingServiceCustomizationForApi("Client prefers morning")).toBe(
      "Client prefers morning",
    );
    expect(
      bookingServiceCustomizationForApi(
        JSON.stringify({ display_name: "X", is_walk_in_custom: true }),
      ),
    ).toBeNull();
  });
});

describe("mapProviderBookingServiceLineForApi", () => {
  it("maps walk-in line to display_name and null customization field", () => {
    const line = mapProviderBookingServiceLineForApi({
      id: "bs-1",
      offering_id: "hidden-offering",
      customization: JSON.stringify({
        display_name: "Bridal",
        is_walk_in_custom: true,
      }),
      offerings: { title: "Walk-in custom service" },
      duration_minutes: 90,
      price: 500,
    });
    expect(line.offering_name).toBe("Bridal");
    expect(line.service_name).toBe("Bridal");
    expect(line.customization).toBeNull();
  });

  it("maps catalog line with plain note in customization", () => {
    const line = mapProviderBookingServiceLineForApi({
      id: "bs-2",
      offering_id: CATALOG_UUID,
      customization: "Allergic to latex",
      offerings: { title: "Manicure" },
    });
    expect(line.offering_name).toBe("Manicure");
    expect(line.customization).toBe("Allergic to latex");
  });
});
