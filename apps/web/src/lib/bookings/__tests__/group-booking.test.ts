import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupBooking } from "../group-booking";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const PRIMARY_BOOKING_ID = "11111111-1111-4111-8111-111111111111";

describe("createGroupBooking", () => {
  const groupDeleteEq = vi.fn();
  let participantInsertError: { message: string } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    participantInsertError = null;
    groupDeleteEq.mockResolvedValue({ error: null });
  });

  function buildSupabase() {
    return {
      rpc: vi.fn().mockResolvedValue({ data: "GB-UNIT-001", error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    scheduled_at: "2026-06-01T10:00:00.000Z",
                    status: "confirmed",
                    location_id: "loc-1",
                    location_type: "at_salon",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_bookings") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: GROUP_ID,
                    provider_id: PROVIDER_ID,
                    ref_number: "GB-UNIT-001",
                    primary_contact_booking_id: PRIMARY_BOOKING_ID,
                    scheduled_at: "2026-06-01T10:00:00.000Z",
                    status: "confirmed",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({ eq: groupDeleteEq }),
          };
        }
        if (table === "booking_participants") {
          return {
            insert: vi.fn().mockResolvedValue({
              error: participantInsertError,
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
  }

  it("creates group row and inserts participants when linking succeeds", async () => {
    const supabase = buildSupabase();
    const result = await createGroupBooking(
      supabase as never,
      PROVIDER_ID,
      PRIMARY_BOOKING_ID,
      [PRIMARY_BOOKING_ID],
      [
        {
          booking_id: PRIMARY_BOOKING_ID,
          participant_name: "Primary",
          is_primary_contact: true,
          price: 100,
        },
        {
          booking_id: null,
          participant_name: "Guest",
          is_primary_contact: false,
          price: 50,
        },
      ]
    );

    expect(result.id).toBe(GROUP_ID);
    expect(result.ref_number).toBe("GB-UNIT-001");
    expect(groupDeleteEq).not.toHaveBeenCalled();
  });

  it("deletes the group row when participant insert fails", async () => {
    participantInsertError = { message: "fk violation" };
    const supabase = buildSupabase();

    await expect(
      createGroupBooking(supabase as never, PROVIDER_ID, PRIMARY_BOOKING_ID, [PRIMARY_BOOKING_ID], [
        {
          booking_id: PRIMARY_BOOKING_ID,
          participant_name: "Primary",
          is_primary_contact: true,
        },
      ])
    ).rejects.toEqual(participantInsertError);

    expect(groupDeleteEq).toHaveBeenCalledWith("id", GROUP_ID);
  });
});
