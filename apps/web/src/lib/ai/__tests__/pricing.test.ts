import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

import {
  clearModelPricingCache,
  computeCostUsd,
  estimateCostUsd,
  getModelPricing,
  loadModelPricing,
  DEFAULT_MODEL_PRICING,
} from "../pricing";

function supabaseReturning(rows: unknown[] | null, error: unknown = null) {
  const lte = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn(() => ({ lte }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from };
}

describe("ai pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearModelPricingCache();
  });

  it("computeCostUsd is per-1k tokens and rounded to 6 dp", () => {
    // gemini-2.5-flash: $0.30 / $2.50 per 1M => 0.0003 / 0.0025 per 1k
    const usd = computeCostUsd({ inputUsdPer1k: 0.0003, outputUsdPer1k: 0.0025 }, 1000, 1000);
    expect(usd).toBeCloseTo(0.0028, 6);
    expect(computeCostUsd({ inputUsdPer1k: 0.0003, outputUsdPer1k: 0.0025 }, 0, 0)).toBe(0);
    expect(computeCostUsd({ inputUsdPer1k: 0.0003, outputUsdPer1k: 0.0025 }, -5, Number.NaN)).toBe(0);
  });

  it("estimates cost from Gemini usage metadata using the DB row", async () => {
    const { client } = supabaseReturning([
      { model: "gemini-2.5-flash-lite", input_usd_per_1k: "0.0002", output_usd_per_1k: "0.0008" },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(client);

    // promptTokenCount=2000, candidatesTokenCount=500
    const usd = await estimateCostUsd("gemini-2.5-flash-lite", 2000, 500);
    expect(usd).toBeCloseTo(2 * 0.0002 + 0.5 * 0.0008, 6); // 0.0008
  });

  it("falls back to in-code defaults for models without a DB row and to flash pricing for unknown models", async () => {
    const { client } = supabaseReturning([]);
    mockGetSupabaseAdmin.mockReturnValue(client);

    const pro = await getModelPricing("gemini-2.5-pro");
    expect(pro.inputUsdPer1k).toBe(DEFAULT_MODEL_PRICING["gemini-2.5-pro"].inputUsdPer1k);

    const unknown = await getModelPricing("gemini-9-ultra");
    expect(unknown.inputUsdPer1k).toBeGreaterThan(0);
    expect(await estimateCostUsd("gemini-9-ultra", 1000, 0)).toBeGreaterThan(0);
  });

  it("caches the pricing table so repeated calls hit the DB once", async () => {
    const { client, from } = supabaseReturning([
      { model: "gemini-2.0-flash", input_usd_per_1k: 0.0001, output_usd_per_1k: 0.0004 },
    ]);
    mockGetSupabaseAdmin.mockReturnValue(client);

    await loadModelPricing();
    await estimateCostUsd("gemini-2.0-flash", 10, 10);
    await estimateCostUsd("gemini-2.5-flash", 10, 10);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("keeps defaults when the table query errors", async () => {
    const { client } = supabaseReturning(null, { message: "relation does not exist" });
    mockGetSupabaseAdmin.mockReturnValue(client);
    const usd = await estimateCostUsd("gemini-2.5-flash-lite", 1000, 1000);
    expect(usd).toBeCloseTo(0.0001 + 0.0004, 6);
  });
});
