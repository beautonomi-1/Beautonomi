import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildUserContactSearchOrClauses,
  contactMatchesSearchQuery,
  findProviderSavedClientMatches,
} from "../client-contact-search";

describe("contactMatchesSearchQuery", () => {
  it("matches a national 0 number against an E.164 phone", () => {
    expect(contactMatchesSearchQuery("082 123 4567", { phone: "+27821234567" })).toBe(true);
    expect(contactMatchesSearchQuery("0821", { phone: "+27821234567" })).toBe(true);
  });

  it("matches email and provider-supplied contact on limited links", () => {
    expect(contactMatchesSearchQuery("Jane@Example", { email: "jane@example.com" })).toBe(true);
    expect(
      contactMatchesSearchQuery("typed@x.co", { provider_supplied_email: "typed@x.co" }),
    ).toBe(true);
    expect(
      contactMatchesSearchQuery("0831112222", { provider_supplied_phone: "+27831112222" }),
    ).toBe(true);
  });

  it("does not phone-match fewer than 4 digits", () => {
    expect(contactMatchesSearchQuery("082", { phone: "+27821234567" })).toBe(false);
  });
});

describe("buildUserContactSearchOrClauses", () => {
  it("adds name/email per text term and phone per needle, stripping reserved chars", () => {
    expect(buildUserContactSearchOrClauses(["jo(e)", "smith"], ["0821", "821"])).toEqual([
      "full_name.ilike.%joe%",
      "email.ilike.%joe%",
      "full_name.ilike.%smith%",
      "email.ilike.%smith%",
      "phone.ilike.%0821%",
      "phone.ilike.%821%",
    ]);
  });
});

/**
 * Minimal Supabase stand-in: `provider_clients` returns the saved rows; `users`
 * returns nothing for the SQL `.or()` pass (as if `ilike` missed) and every
 * requested user for the phone-only in-memory pass.
 */
function fakeAdmin(
  savedRows: Array<Record<string, unknown>>,
  users: Array<{ id: string; phone: string | null }>,
): SupabaseClient {
  const from = (table: string) => {
    let ids: string[] = [];
    let usedOr = false;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      in: (_col: string, values: string[]) => {
        ids = values;
        return builder;
      },
      or: () => {
        usedOr = true;
        return builder;
      },
      range: () => builder,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
        if (table === "provider_clients") return resolve({ data: savedRows, error: null });
        const data = usedOr ? [] : users.filter((u) => ids.includes(u.id));
        return resolve({ data, error: null });
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

describe("findProviderSavedClientMatches", () => {
  const savedRows = [
    { id: "pc1", customer_id: "u1", source_metadata: null, notes: null, tags: null },
    {
      id: "pc2",
      customer_id: "u2",
      source_metadata: {
        provider_supplied_name: "Front Desk",
        provider_supplied_email: "front@desk.co",
        provider_supplied_phone: null,
      },
      notes: null,
      tags: null,
    },
    { id: "pc3", customer_id: "u3", source_metadata: null, notes: "Prefers mornings", tags: ["VIP"] },
  ];
  const users = [
    { id: "u1", phone: "+27 82 123 4567" },
    { id: "u2", phone: null },
    { id: "u3", phone: null },
  ];

  it("finds a spaced stored phone from a national 0 query", async () => {
    const { matchedCustomerIds } = await findProviderSavedClientMatches(
      fakeAdmin(savedRows, users),
      "p1",
      "0821234567",
    );
    expect([...matchedCustomerIds]).toEqual(["u1"]);
  });

  it("finds provider-supplied email, notes and tags", async () => {
    const admin = fakeAdmin(savedRows, users);
    expect([...(await findProviderSavedClientMatches(admin, "p1", "front@")).matchedCustomerIds]).toEqual(["u2"]);
    expect([...(await findProviderSavedClientMatches(admin, "p1", "front desk")).matchedCustomerIds]).toEqual(["u2"]);
    expect([...(await findProviderSavedClientMatches(admin, "p1", "mornings")).matchedCustomerIds]).toEqual(["u3"]);
    expect([...(await findProviderSavedClientMatches(admin, "p1", "vip")).matchedCustomerIds]).toEqual(["u3"]);
  });
});
