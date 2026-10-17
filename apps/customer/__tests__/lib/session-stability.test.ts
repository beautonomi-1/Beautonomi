import type { User } from "@supabase/supabase-js";
import { isSameAuthUser } from "@/lib/auth/session-stability";

function user(partial: Partial<User> & { id: string }): User {
  return {
    id: partial.id,
    aud: "authenticated",
    role: "authenticated",
    email: partial.email ?? "a@b.com",
    phone: partial.phone ?? "",
    created_at: "2020-01-01",
    updated_at: partial.updated_at ?? "2020-01-02",
    app_metadata: partial.app_metadata ?? {},
    user_metadata: partial.user_metadata ?? {},
  } as User;
}

describe("isSameAuthUser", () => {
  it("returns true for null/null and false when only one is null", () => {
    expect(isSameAuthUser(null, null)).toBe(true);
    const u = user({ id: "1" });
    expect(isSameAuthUser(u, null)).toBe(false);
    expect(isSameAuthUser(null, u)).toBe(false);
  });

  it("returns true when identity fields match", () => {
    const a = user({ id: "1", updated_at: "t1", email: "x@y.com", user_metadata: { n: 1 } });
    const b = user({ id: "1", updated_at: "t1", email: "x@y.com", user_metadata: { n: 1 } });
    expect(isSameAuthUser(a, b)).toBe(true);
  });

  it("returns false when updated_at, email, id, or metadata differ", () => {
    const base = user({ id: "1" });
    expect(isSameAuthUser(base, user({ id: "2" }))).toBe(false);
    expect(isSameAuthUser(base, user({ id: "1", updated_at: "other" }))).toBe(false);
    expect(isSameAuthUser(base, user({ id: "1", email: "other@x.com" }))).toBe(false);
    expect(
      isSameAuthUser(base, user({ id: "1", user_metadata: { changed: true } })),
    ).toBe(false);
    expect(
      isSameAuthUser(base, user({ id: "1", app_metadata: { role: "provider_owner" } })),
    ).toBe(false);
  });
});
