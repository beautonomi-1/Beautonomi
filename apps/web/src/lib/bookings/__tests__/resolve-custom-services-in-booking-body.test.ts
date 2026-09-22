import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const ensureWalkInCustomOffering = vi.fn();

vi.mock("../walk-in-custom-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../walk-in-custom-service")>();
  return {
    ...actual,
    ensureWalkInCustomOffering: (...args: unknown[]) => ensureWalkInCustomOffering(...args),
  };
});

import { resolveCustomServicesInBookingBody } from "../resolve-custom-services-in-booking-body";

const CATALOG_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const HIDDEN_OFFERING = "00000000-0000-4000-8000-000000000001";

describe("resolveCustomServicesInBookingBody", () => {
  beforeEach(() => {
    ensureWalkInCustomOffering.mockReset();
    ensureWalkInCustomOffering.mockResolvedValue(HIDDEN_OFFERING);
  });

  it("does not call ensureWalkInCustomOffering when all lines are catalog", async () => {
    const services = [{ service_id: CATALOG_UUID, name: "Haircut", price: 100 }];
    const result = await resolveCustomServicesInBookingBody(
      {} as SupabaseClient,
      "provider-1",
      "ZAR",
      services,
    );
    expect(ensureWalkInCustomOffering).not.toHaveBeenCalled();
    expect(result).toEqual(services);
  });

  it("remaps custom lines and preserves catalog lines", async () => {
    const services = [
      { service_id: CATALOG_UUID, name: "Haircut", price: 100, staff_id: "s1" },
      { isCustom: true, customName: "Bridal", service_id: CATALOG_UUID, price: 500, staff_id: "s2" },
    ];
    const result = await resolveCustomServicesInBookingBody(
      {} as SupabaseClient,
      "provider-1",
      "ZAR",
      services,
    );
    expect(ensureWalkInCustomOffering).toHaveBeenCalledOnce();
    expect(result?.[0]).toMatchObject({ service_id: CATALOG_UUID, name: "Haircut" });
    expect(result?.[1]).toMatchObject({
      service_id: HIDDEN_OFFERING,
      offering_id: HIDDEN_OFFERING,
      staff_id: "s2",
      price: 500,
    });
    const customization = JSON.parse(String(result?.[1]?.customization));
    expect(customization).toMatchObject({
      display_name: "Bridal",
      is_walk_in_custom: true,
      custom_line_index: 0,
    });
  });

  it("remaps web custom- id with serviceName", async () => {
    const services = [{ serviceId: "custom-1", serviceName: "Bridal", price: 400 }];
    const result = await resolveCustomServicesInBookingBody(
      {} as SupabaseClient,
      "provider-1",
      "ZAR",
      services,
    );
    expect(result?.[0]?.service_id).toBe(HIDDEN_OFFERING);
    const customization = JSON.parse(String(result?.[0]?.customization));
    expect(customization.display_name).toBe("Bridal");
  });

  it("stores plain customization note inside walk-in JSON", async () => {
    const services = [
      {
        isCustom: true,
        customName: "Bridal",
        customization: "Bring trial kit",
        price: 1,
      },
    ];
    const result = await resolveCustomServicesInBookingBody(
      {} as SupabaseClient,
      "provider-1",
      "ZAR",
      services,
    );
    const customization = JSON.parse(String(result?.[0]?.customization));
    expect(customization.notes).toBe("Bring trial kit");
  });
});
