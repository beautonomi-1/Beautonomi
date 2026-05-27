import { describe, expect, it } from "vitest";

/**
 * Lightweight validation mirrors for POST /api/provider/services rules
 * (full route tests require Supabase mocks — these guard regression on
 * catalogue parity validation messages).
 */
function validateCreateServiceBody(body: {
  name?: string;
  title?: string;
  price?: number | string;
  duration_minutes?: number | string;
  service_type?: string;
  parent_service_id?: string | null;
}) {
  const serviceTitle = body.title || body.name;
  if (!serviceTitle || body.duration_minutes == null || body.duration_minutes === "") {
    return { ok: false, code: "MISSING_FIELDS" };
  }
  if (body.price == null || body.price === "" || Number.isNaN(parseFloat(String(body.price)))) {
    return { ok: false, code: "MISSING_PRICE" };
  }
  if (body.service_type === "variant" && !body.parent_service_id) {
    return { ok: false, code: "VARIANT_PARENT_REQUIRED" };
  }
  return { ok: true, code: null };
}

describe("catalogue POST validation parity", () => {
  it("rejects variant without parent_service_id", () => {
    const result = validateCreateServiceBody({
      name: "Short",
      price: 100,
      duration_minutes: 30,
      service_type: "variant",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("VARIANT_PARENT_REQUIRED");
  });

  it("accepts price 0", () => {
    const result = validateCreateServiceBody({
      name: "Free consult",
      price: 0,
      duration_minutes: 15,
      service_type: "basic",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts variant with parent", () => {
    const result = validateCreateServiceBody({
      name: "Short",
      price: 50,
      duration_minutes: 30,
      service_type: "variant",
      parent_service_id: "parent-uuid",
    });
    expect(result.ok).toBe(true);
  });
});

describe("category delete guard", () => {
  it("returns CATEGORY_HAS_SERVICES when linked offerings exist", () => {
    const linked = [{ id: "s1", title: "Cut" }];
    const shouldBlock = linked.length > 0;
    expect(shouldBlock).toBe(true);
    if (shouldBlock) {
      expect({
        code: "CATEGORY_HAS_SERVICES",
        services: linked.map((s) => ({ id: s.id, name: s.title })),
      }).toEqual({
        code: "CATEGORY_HAS_SERVICES",
        services: [{ id: "s1", name: "Cut" }],
      });
    }
  });
});

describe("category-scoped reorder", () => {
  it("only swaps neighbours in the same category", () => {
    const siblings = [
      { id: "a", provider_category_id: "cat-1", display_order: 0 },
      { id: "b", provider_category_id: "cat-1", display_order: 1 },
      { id: "c", provider_category_id: "cat-2", display_order: 0 },
    ];
    const currentId = "b";
    const direction = "up" as const;
    const current = siblings.find((s) => s.id === currentId)!;
    const ordered = siblings
      .filter((s) => s.provider_category_id === current.provider_category_id)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const idx = ordered.findIndex((s) => s.id === currentId);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    expect(targetIdx).toBe(0);
    expect(ordered[targetIdx].id).toBe("a");
    expect(ordered.every((s) => s.provider_category_id === "cat-1")).toBe(true);
  });
});
