import { describe, expect, it, vi } from "vitest";
import { enrichWalletTopupMetadataFromReference } from "../enrich-wallet-topup-metadata-from-reference";

describe("enrichWalletTopupMetadataFromReference", () => {
  it("parses wallet_topup_{uuid} reference", async () => {
    const metadata: Record<string, unknown> = {};
    const supabase = { from: vi.fn() };
    await enrichWalletTopupMetadataFromReference(
      supabase as never,
      "wallet_topup_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      metadata,
    );
    expect(metadata.wallet_topup_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("looks up wallet_topups by paystack_reference when pattern does not match", async () => {
    const metadata: Record<string, unknown> = {};
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: "topup-db-id" }, error: null })),
          })),
        })),
      })),
    };
    await enrichWalletTopupMetadataFromReference(supabase as never, "T1234567890", metadata);
    expect(metadata.wallet_topup_id).toBe("topup-db-id");
  });
});
