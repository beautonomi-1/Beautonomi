import { describe, expect, it, vi } from "vitest";
import { validateCollectionLocationForProvider } from "../product-order-delivery-quote";

function chainMock(result: { data: unknown; error: unknown }) {
  const terminal = { maybeSingle: vi.fn(async () => result) };
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  Object.assign(chain, terminal);
  return chain;
}

describe("validateCollectionLocationForProvider", () => {
  it("rejects when location is not found for provider", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => chainMock({ data: null, error: null })),
      })),
    };

    const result = await validateCollectionLocationForProvider(supabase as never, "prov-1", "loc-1");
    expect(result).toBe(false);
  });

  it("accepts active salon for provider", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() =>
          chainMock({
            data: {
              id: "loc-1",
              provider_id: "prov-1",
              is_active: true,
              location_type: "salon",
            },
            error: null,
          }),
        ),
      })),
    };

    const result = await validateCollectionLocationForProvider(supabase as never, "prov-1", "loc-1");
    expect(result).toBe(true);
  });
});
