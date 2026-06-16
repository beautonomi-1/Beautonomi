import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveCustomerProviderConversation,
  updateConversationAfterMessage,
} from "../resolve-conversation";

function makeAdminMock(handlers: {
  existing?: { id: string; booking_id?: string | null } | null;
  lookupError?: Error;
  createError?: Error;
  createdId?: string;
}) {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const inserts: Record<string, unknown>[] = [];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                      if (handlers.lookupError) {
                        return { data: null, error: handlers.lookupError };
                      }
                      return { data: handlers.existing ?? null, error: null };
                    }),
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                inserts.push(payload);
                if (handlers.createError) {
                  return { data: null, error: handlers.createError };
                }
                return { data: { id: handlers.createdId ?? "conv-new" }, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((id: string) => {
              updates.push({ id, payload });
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      return {};
    }),
  };

  return { admin: admin as never, updates, inserts };
}

describe("resolveCustomerProviderConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses existing conversation regardless of booking_id scope", async () => {
    const { admin, updates } = makeAdminMock({
      existing: { id: "conv-existing", booking_id: "booking-1" },
    });

    const result = await resolveCustomerProviderConversation(admin, {
      customerId: "cust-1",
      providerId: "prov-1",
    });

    expect(result).toEqual({ id: "conv-existing", created: false });
    expect(updates).toHaveLength(0);
  });

  it("back-fills booking_id when provided and missing on existing row", async () => {
    const { admin, updates } = makeAdminMock({
      existing: { id: "conv-existing", booking_id: null },
    });

    await resolveCustomerProviderConversation(admin, {
      customerId: "cust-1",
      providerId: "prov-1",
      bookingId: "booking-99",
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload.booking_id).toBe("booking-99");
  });

  it("creates a conversation when none exists", async () => {
    const { admin, inserts } = makeAdminMock({ existing: null, createdId: "conv-created" });

    const result = await resolveCustomerProviderConversation(admin, {
      customerId: "cust-1",
      providerId: "prov-1",
      lastMessageSenderId: "cust-1",
    });

    expect(result).toEqual({ id: "conv-created", created: true });
    expect(inserts[0]?.customer_id).toBe("cust-1");
    expect(inserts[0]?.provider_id).toBe("prov-1");
  });
});

describe("updateConversationAfterMessage", () => {
  it("updates metadata without touching unread counts", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const admin = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
      })),
    };

    await updateConversationAfterMessage(admin as never, "conv-1", "user-1", "Hello");

    expect(updates[0]).toMatchObject({
      last_message_preview: "Hello",
      last_message_sender_id: "user-1",
    });
    expect(updates[0]).not.toHaveProperty("unread_count_provider");
    expect(updates[0]).not.toHaveProperty("unread_count_customer");
  });
});
