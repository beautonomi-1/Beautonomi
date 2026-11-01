import { describe, expect, it } from "vitest";
import { buildTrendChartLayout } from "./adminTrendChartLayout";

describe("buildTrendChartLayout", () => {
  it("returns null when no finite values", () => {
    expect(buildTrendChartLayout([{ date: "2026-01-01", value: NaN }], 120)).toBeNull();
  });

  it("builds a path for multiple points and a dot-only layout for one point", () => {
    const multi = buildTrendChartLayout(
      [
        { date: "2026-01-01", value: 1 },
        { date: "2026-01-02", value: 3 },
      ],
      120,
    );
    expect(multi?.path).toMatch(/^M/);
    expect(multi?.points).toHaveLength(2);

    const single = buildTrendChartLayout([{ date: "2026-01-01", value: 5 }], 120);
    expect(single?.path).toBe("");
    expect(single?.points).toHaveLength(1);
  });

  it("uses data min and max for y scale labels", () => {
    const layout = buildTrendChartLayout(
      [
        { date: "2026-01-01", value: 10 },
        { date: "2026-01-02", value: 20 },
      ],
      120,
    );
    expect(layout?.yMin).toBe(10);
    expect(layout?.yMax).toBe(20);
  });
});
