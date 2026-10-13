import { describe, expect, it } from "vitest";
import {
  buildServiceCategoryOptions,
  getServiceCategoryInfo,
  UNCATEGORIZED_SERVICE_CATEGORY,
} from "../service-category";
import type { ServiceItem } from "../types";

describe("service-category", () => {
  it("builds sorted category options from services", () => {
    const services = [
      {
        id: "1",
        name: "Cut",
        provider_category_id: "c1",
        category_name: "Hair",
        category_order: 1,
        service_type: "basic",
      },
      {
        id: "2",
        name: "Color",
        provider_category_id: "c2",
        category_name: "Nails",
        category_order: 0,
        service_type: "basic",
      },
    ] as ServiceItem[];

    const options = buildServiceCategoryOptions(services, "Other", () => true);
    expect(options.map((o) => o.label)).toEqual(["Nails", "Hair"]);
  });

  it("uses uncategorized bucket when category is missing", () => {
    const info = getServiceCategoryInfo({ name: "X" } as ServiceItem, "Other");
    expect(info.id).toBe(UNCATEGORIZED_SERVICE_CATEGORY);
    expect(info.label).toBe("Other");
  });
});
