import { describe, expect, it } from "vitest";
import { resolvePublicCategorySlug, translatePublicCategoryLabel } from "../public-category";

describe("resolvePublicCategorySlug", () => {
  it("maps exact catalog slugs", () => {
    expect(resolvePublicCategorySlug("hair")).toBe("hair");
    expect(resolvePublicCategorySlug("brows-lashes")).toBe("brows-lashes");
  });

  it("maps provider spelling variants without needing the exact slug", () => {
    expect(resolvePublicCategorySlug("Hair Services")).toBe("hair");
    expect(resolvePublicCategorySlug("Nail salon")).toBe("nails");
    expect(resolvePublicCategorySlug("Haar")).toBe("hair");
    expect(resolvePublicCategorySlug("Naels")).toBe("nails");
    expect(resolvePublicCategorySlug("Make-up")).toBe("makeup");
    expect(resolvePublicCategorySlug("Afro hair")).toBe("afro");
  });

  it("prefers the more specific slug when a phrase contains two matches", () => {
    expect(resolvePublicCategorySlug("Hair removal")).toBe("hair-removal");
    expect(resolvePublicCategorySlug("Body massage")).toBe("massage");
  });

  it("leaves unknown provider names unmatched", () => {
    expect(resolvePublicCategorySlug("Bob's Specials")).toBeNull();
    expect(resolvePublicCategorySlug("")).toBeNull();
  });
});

describe("translatePublicCategoryLabel", () => {
  const t = (key: string) => {
    if (key === "web.categories.hair") return "Haar";
    if (key === "web.categories.threading") return "Fädenziehen";
    if (key === "web.layout.header.allCategories") return "Alle";
    return key;
  };

  it("translates a resolved slug and keeps unknown names as written", () => {
    expect(translatePublicCategoryLabel(t, "hair-services", "Hair Services")).toBe("Haar");
    expect(translatePublicCategoryLabel(t, "all")).toBe("Alle");
    expect(translatePublicCategoryLabel(t, "custom-menu", "Bob's Specials")).toBe("Bob's Specials");
  });

  it("translates admin-created slugs via web.categories.<slug>", () => {
    expect(translatePublicCategoryLabel(t, "threading", "Threading")).toBe("Fädenziehen");
  });

  it("uses admin name_i18n when no locale-file key exists", () => {
    expect(
      translatePublicCategoryLabel(t, "henna", "Henna", {
        language: "de",
        nameI18n: { en: "Henna", de: "Henna-Kunst" },
      }),
    ).toBe("Henna-Kunst");
  });

  it("prefers catalog locale keys over admin name_i18n", () => {
    expect(
      translatePublicCategoryLabel(t, "hair", "Hair", {
        language: "de",
        nameI18n: { de: "Admin override" },
      }),
    ).toBe("Haar");
  });
});
