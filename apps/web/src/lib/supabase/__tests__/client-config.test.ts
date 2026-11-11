import { describe, expect, it, vi } from "vitest";

import { resolvePublicSupabaseConfig } from "../client";

// Audit F-02: the browser client must not silently fall back to a placeholder project.
describe("resolvePublicSupabaseConfig", () => {
  const good = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-tests",
  };

  it("returns the configured url + anon key", () => {
    expect(resolvePublicSupabaseConfig(good, "development")).toEqual({
      url: good.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: good.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  });

  it("throws in production when a variable is missing", () => {
    expect(() =>
      resolvePublicSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: good.NEXT_PUBLIC_SUPABASE_URL }, "production"),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(() => resolvePublicSupabaseConfig({}, "production")).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("returns null (never a placeholder project) outside production", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = resolvePublicSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "   " }, "development");
    expect(result).toBeNull();
    err.mockRestore();
  });
});
