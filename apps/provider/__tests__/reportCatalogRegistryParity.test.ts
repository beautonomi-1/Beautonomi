import { PROVIDER_REPORT_CATEGORIES } from "../app/(app)/(tabs)/more/reports/reportCatalog";
import { REPORT_DETAIL_REGISTRY } from "../src/features/reports/reportDetailRegistry";

describe("provider report catalog ↔ registry", () => {
  it("every detail reportId maps to REPORT_DETAIL_REGISTRY", () => {
    const detailIds: string[] = [];
    for (const cat of PROVIDER_REPORT_CATEGORIES) {
      for (const item of cat.reports) {
        if (item.target === "detail") {
          detailIds.push(item.reportId);
        }
      }
    }
    expect(detailIds.length).toBeGreaterThan(0);
    for (const id of detailIds) {
      expect(REPORT_DETAIL_REGISTRY[id]).toBeDefined();
    }
  });
});
