import {
  groupServicesIntoSections,
  OTHER_SERVICES_KEY,
  ALL_SERVICES_KEY,
  OTHER_SERVICES_SORT_ORDER,
} from "@/features/catalogue/groupServicesIntoSections";
import type { CatalogueServiceItem, CategoryOption } from "@/features/catalogue/types";

describe("groupServicesIntoSections", () => {
  const categories: CategoryOption[] = [
    { id: "cat-1", name: "Hair", display_order: 0 },
    { id: "cat-2", name: "Nails", display_order: 1 },
  ];

  const services: CatalogueServiceItem[] = [
    { id: "s1", title: "Cut", provider_category_id: "cat-1", service_type: "basic", display_order: 0, is_active: true },
    { id: "s2", title: "Polish", provider_category_id: "cat-2", service_type: "addon", display_order: 0, is_active: true },
    { id: "v1", title: "Cut - Short", service_type: "variant", parent_service_id: "s1", variant_name: "Short", price: 100, duration_minutes: 30, is_active: true },
    { id: "orphan", title: "Misc", provider_category_id: null, service_type: "basic", display_order: 0, is_active: true },
  ];

  it("buckets services by category and nests variants", () => {
    const sections = groupServicesIntoSections(services, categories, { includeVariants: true });
    const hair = sections.find((s) => s.sectionKey === "cat-1");
    expect(hair?.items[0].variants?.length).toBe(1);
    expect(hair?.items[0].variants?.[0].id).toBe("v1");
  });

  it("places orphaned services in Other Services at sortOrder 9999", () => {
    const sections = groupServicesIntoSections(services, categories);
    const other = sections.find((s) => s.sectionKey === OTHER_SERVICES_KEY);
    expect(other?.title).toBe("Other Services");
    expect(other?.sortOrder).toBe(OTHER_SERVICES_SORT_ORDER);
    expect(other?.items.some((i) => i.id === "orphan")).toBe(true);
  });

  it("uses All Services virtual bucket when no categories exist", () => {
    const sections = groupServicesIntoSections(
      [{ id: "s1", title: "Only", service_type: "basic", is_active: true }],
      [],
    );
    expect(sections[0].sectionKey).toBe(ALL_SERVICES_KEY);
    expect(sections[0].title).toBe("All Services");
  });

  it("sorts basics before addons within a category", () => {
    const mixed: CatalogueServiceItem[] = [
      { id: "a1", title: "Addon A", provider_category_id: "cat-1", service_type: "addon", display_order: 0, is_active: true },
      { id: "b1", title: "Basic B", provider_category_id: "cat-1", service_type: "basic", display_order: 1, is_active: true },
    ];
    const sections = groupServicesIntoSections(mixed, categories);
    const hair = sections.find((s) => s.sectionKey === "cat-1");
    expect(hair?.items[0].id).toBe("b1");
    expect(hair?.items[1].id).toBe("a1");
  });
});
