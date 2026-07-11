import { describe, it, expect } from "vitest";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";

describe("migration-required helper", () => {
  it("detects missing relation errors", () => {
    expect(isMissingRelationError({ code: "42P01" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST116" })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
  });

  it("returns 503 with MIGRATION_REQUIRED code", async () => {
    const res = migrationRequiredResponse("Staff time tracking");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("MIGRATION_REQUIRED");
    expect(body.error.message).toContain("Staff time tracking");
  });
});
