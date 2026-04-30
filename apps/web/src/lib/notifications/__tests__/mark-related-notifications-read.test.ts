import { describe, it, expect, vi } from "vitest";
import {
  markRelatedNotificationsReadForUser,
  markRelatedNotificationsReadSchema,
} from "../mark-related-notifications-read";

describe("markRelatedNotificationsReadSchema", () => {
  it("requires at least one id", () => {
    expect(markRelatedNotificationsReadSchema.safeParse({}).success).toBe(false);
  });

  it("accepts booking_id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const r = markRelatedNotificationsReadSchema.safeParse({ booking_id: id });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.booking_id).toBe(id);
  });
});

describe("markRelatedNotificationsReadForUser", () => {
  it("runs chained updates and sums marked rows", async () => {
    const from = vi.fn().mockReturnThis();
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const or = vi.fn().mockReturnThis();
    const select = vi.fn();

    select
      .mockResolvedValueOnce({ data: [{ id: "a" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "b" }, { id: "c" }], error: null });

    const supabase = { from } as any;
    from.mockReturnValue({ update, eq, or, select });
    update.mockReturnValue({ eq, or, select });
    eq.mockReturnValue({ eq, or, select });

    const userId = "650e8400-e29b-41d4-a716-446655440001";
    const bookingId = "750e8400-e29b-41d4-a716-446655440002";
    const conversationId = "850e8400-e29b-41d4-a716-446655440003";

    const result = await markRelatedNotificationsReadForUser(supabase, userId, {
      booking_id: bookingId,
      conversation_id: conversationId,
    });

    expect(result.marked).toBe(3);
    expect(from).toHaveBeenCalledWith("notifications");
    expect(or).toHaveBeenCalledTimes(2);
  });
});
