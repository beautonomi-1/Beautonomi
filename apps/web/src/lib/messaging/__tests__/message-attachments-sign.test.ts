import { describe, expect, it, vi } from "vitest";
import { signMessageAttachmentsForResponse } from "../message-attachments";

describe("signMessageAttachmentsForResponse", () => {
  it("signs storage attachments with bounded parallel calls", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    let inFlight = 0;
    let maxInFlight = 0;
    const storageClient = {
      storage: {
        from: () => ({
          createSignedUrl: vi.fn(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight -= 1;
            return { data: { signedUrl: "https://signed.example/a" }, error: null };
          }),
        }),
      },
    };

    const attachments = Array.from({ length: 12 }, (_, i) => ({
      url: `https://x.supabase.co/storage/v1/object/public/message-attachments/path/${i}.jpg`,
      name: `f-${i}`,
    }));

    const out = await signMessageAttachmentsForResponse(
      attachments,
      storageClient as never,
      new Date().toISOString(),
    );

    expect(out).toHaveLength(12);
    expect((out[0] as { url?: string }).url).toContain("signed.example");
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("marks expired attachments without signing", async () => {
    const storageClient = {
      storage: {
        from: () => ({
          createSignedUrl: vi.fn(),
        }),
      },
    };
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const out = await signMessageAttachmentsForResponse(
      [
        {
          url: "https://x.supabase.co/storage/v1/object/public/message-attachments/old.jpg",
          name: "old",
        },
      ],
      storageClient as never,
      old,
    );
    const row = out[0] as { expired?: boolean; url?: string };
    expect(row.expired).toBe(true);
    expect(row.url).toBe("");
  });
});
