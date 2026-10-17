import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/api-helpers", () => ({
  errorResponse: (message: string, code: string, status: number) => ({ message, code, status }),
  notFoundResponse: (message: string) => ({ message, status: 404 }),
  userHasProviderAccessAdmin: vi.fn(async () => true),
}));

import {
  requireProviderSupportTicketAccess,
  withProviderAccessColumns,
} from "../provider-support-ticket-access";

describe("withProviderAccessColumns", () => {
  it("appends access columns when the caller selects only id", () => {
    expect(withProviderAccessColumns("id")).toBe("id, provider_id, requester_type");
  });

  it("does not duplicate columns already selected (multiline select)", () => {
    const select = `
      id,
      provider_id,
      requester_type
    `;
    expect(withProviderAccessColumns(select)).toBe(select);
  });
});

describe("requireProviderSupportTicketAccess", () => {
  it("grants access for a minimal select like the handoff route uses", async () => {
    let selected = "";
    const admin = {
      from: () => ({
        select: (cols: string) => {
          selected = cols;
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "t1", provider_id: "p1", requester_type: "provider" },
                error: null,
              }),
            }),
          };
        },
      }),
    } as never;

    const access = await requireProviderSupportTicketAccess(admin, "u1", "t1", "id");
    expect(selected).toContain("provider_id");
    expect(selected).toContain("requester_type");
    expect(access.response).toBeNull();
    expect(access.ticket).toMatchObject({ id: "t1" });
  });
});
