import { describe, expect, it, vi } from "vitest";
import { attachSupportContextToTicket } from "../attach-support-context";

describe("attachSupportContextToTicket", () => {
  it("requires at least one identifier", async () => {
    const admin = {} as never;
    const result = await attachSupportContextToTicket({
      admin,
      ticketId: "t1",
      ticket: { user_id: "u1" },
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("rejects booking not owned by requester", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          ilike: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "b1", booking_number: "BK-1", customer_id: "other", provider_id: "p1" },
              })),
            })),
          })),
        })),
      })),
    } as never;
    const result = await attachSupportContextToTicket({
      admin,
      ticketId: "t1",
      ticket: { user_id: "u1" },
      input: { booking_number: "BK-1" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });
});
