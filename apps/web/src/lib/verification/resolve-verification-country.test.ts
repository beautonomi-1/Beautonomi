import { describe, expect, it, vi } from "vitest";
import { resolveVerificationCountry } from "./resolve-verification-country";

function makeSupabase(rows: Array<{ code: string; name: string }>) {
  const listQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    ilike: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== "iso_countries") throw new Error(`unexpected table ${table}`);
      return listQuery;
    }),
  } as never;
}

describe("resolveVerificationCountry", () => {
  it("accepts ISO codes from iso_countries", async () => {
    const result = await resolveVerificationCountry(
      makeSupabase([{ code: "ZA", name: "South Africa" }]),
      "za",
    );
    expect(result).toEqual({ country: { code: "ZA", name: "South Africa" }, message: null });
  });

  it("accepts country names from the static fallback when DB is empty", async () => {
    const result = await resolveVerificationCountry(makeSupabase([]), "South Africa");
    expect(result.country?.code).toBe("ZA");
    expect(result.message).toBeNull();
  });

  it("rejects empty input", async () => {
    const result = await resolveVerificationCountry(makeSupabase([]), "  ");
    expect(result.country).toBeNull();
    expect(result.message).toBe("Country of issue is required.");
  });

  it("rejects unknown countries", async () => {
    const result = await resolveVerificationCountry(makeSupabase([]), "Atlantis");
    expect(result).toEqual({
      country: null,
      message: "Select a valid country of issue from the list.",
    });
  });
});
