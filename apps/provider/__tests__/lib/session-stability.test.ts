import type { User } from "@supabase/supabase-js";
import { isSameAuthUser } from "@/lib/auth/session-stability";

describe("isSameAuthUser (provider)", () => {
  it("matches customer helper semantics", () => {
    const a = {
      id: "1",
      aud: "authenticated",
      role: "authenticated",
      email: "a@b.com",
      phone: "",
      created_at: "",
      updated_at: "t",
      app_metadata: {},
      user_metadata: {},
    } as User;
    const b = { ...a };
    expect(isSameAuthUser(a, b)).toBe(true);
    expect(isSameAuthUser(a, { ...a, updated_at: "t2" } as User)).toBe(false);
  });
});
