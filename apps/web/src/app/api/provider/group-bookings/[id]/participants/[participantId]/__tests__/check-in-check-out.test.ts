/**
 * Tests for group booking participant check-in and check-out guards.
 *
 * Covers:
 *   - Idempotent check-in: already checked-in participant returns 200 with
 *     existing timestamp instead of overwriting it.
 *   - Ordering enforcement: check-out on a not-yet-checked-in participant
 *     returns 400 NOT_CHECKED_IN.
 *   - Idempotent check-out: already checked-out participant returns 200.
 *   - Happy-path check-in and check-out write the correct fields.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --------------------------------------------------------------------------
// Shared mocks (must be hoisted before any import that uses them)
// --------------------------------------------------------------------------

const mockUser = {
  id: "user-provider-1",
  role: "provider_owner" as const,
};

const GROUP_ID = "group-abc-123";
const PARTICIPANT_ID = "participant-xyz-456";
const BOOKING_ID = "booking-def-789";
const PROVIDER_ID = "provider-id-1";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual("@/lib/supabase/api-helpers");
  return {
    ...actual,
    requireRoleInApi: vi.fn(async () => ({ user: mockUser })),
    userHasProviderAccessAdmin: vi.fn(async () => true),
    successResponse: vi.fn((data) =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ),
    notFoundResponse: vi.fn((msg = "Not found") =>
      new Response(JSON.stringify({ error: msg }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    ),
    forbiddenResponse: vi.fn((msg = "Forbidden") =>
      new Response(JSON.stringify({ error: msg }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    ),
    errorResponse: vi.fn((msg, _code, status = 400) =>
      new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    ),
    handleApiError: vi.fn((err) =>
      new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    ),
  };
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeRequest(method = "POST") {
  return new NextRequest(`http://localhost/api/provider/group-bookings/${GROUP_ID}/participants/${PARTICIPANT_ID}/check-in`, {
    method,
  });
}

function makeParams(id = GROUP_ID, participantId = PARTICIPANT_ID) {
  return { params: Promise.resolve({ id, participantId }) };
}

/** Build a minimal Supabase query chain mock. */
function buildAdminMock(rows: {
  group?: { id: string; provider_id: string } | null;
  participant?: Record<string, unknown> | null;
  updateParticipant?: Record<string, unknown> | null;
  groupUpdateError?: { message: string } | null;
}) {
  const makeQuery = (result: { data: unknown; error: unknown }) => {
    const query: Record<string, unknown> = {};
    query.eq = vi.fn().mockReturnValue(query);
    query.is = vi.fn().mockReturnValue(query);
    query.not = vi.fn().mockReturnValue(query);
    query.select = vi.fn().mockReturnValue(query);
    query.maybeSingle = vi.fn().mockResolvedValue(result);
    query.single = vi.fn().mockResolvedValue(result);
    query.then = (resolve: (value: typeof result) => unknown) => resolve(result);
    return query;
  };

  // Simple call-count based dispatch for `.from(table)`
  let callIdx = 0;
  const fromMock = vi.fn().mockImplementation((table: string) => {
    callIdx++;
    if (table === "group_bookings" && callIdx === 1) {
      // First call: existence check on group_bookings
      const query = makeQuery({
        data: rows.group ?? { id: GROUP_ID, provider_id: PROVIDER_ID },
        error: null,
      });
      return { select: vi.fn().mockReturnValue(query) };
    }
    if (table === "booking_participants") {
      // Second call: pre-flight participant fetch; subsequent: update
      const selectQuery = makeQuery({
        data: rows.participant ?? null,
        error: null,
      });
      const updateQuery = makeQuery({
        data: rows.updateParticipant ?? null,
        error: null,
      });
      return {
        select: vi.fn().mockReturnValue(selectQuery),
        update: vi.fn().mockReturnValue(updateQuery),
      };
    }
    // Linked booking sync or group status update (best-effort).
    const updateQuery = makeQuery({
      data: null,
      error: rows.groupUpdateError ?? null,
    });
    return {
      update: vi.fn().mockReturnValue(updateQuery),
      select: vi.fn().mockReturnValue(makeQuery({ data: null, error: null })),
    };
  });

  return { from: fromMock };
}

// --------------------------------------------------------------------------
// check-in tests
// --------------------------------------------------------------------------

describe("POST check-in", () => {
  let POST_checkIn: typeof import("../check-in/route").POST;
  let getSupabaseAdminMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    getSupabaseAdminMock = getSupabaseAdmin as ReturnType<typeof vi.fn>;
    const mod = await import("../check-in/route");
    POST_checkIn = mod.POST;
  });

  it("returns 200 with existing timestamp when participant is already checked in", async () => {
    const alreadyCheckedIn = {
      id: PARTICIPANT_ID,
      booking_id: BOOKING_ID,
      checked_in_at: "2026-05-20T08:00:00.000Z",
    };
    getSupabaseAdminMock.mockReturnValue(buildAdminMock({ participant: alreadyCheckedIn }));

    const res = await POST_checkIn(makeRequest(), makeParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.checked_in_at).toBe(alreadyCheckedIn.checked_in_at);
    expect(body.data.message).toBe("Participant already checked in");
  });

  it("returns 404 when participant does not belong to the group", async () => {
    getSupabaseAdminMock.mockReturnValue(buildAdminMock({ participant: null }));

    const res = await POST_checkIn(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("writes checked_in_at when participant has not been checked in yet", async () => {
    const notCheckedIn = {
      id: PARTICIPANT_ID,
      booking_id: BOOKING_ID,
      checked_in_at: null,
    };
    const afterUpdate = {
      id: PARTICIPANT_ID,
      booking_id: BOOKING_ID,
      checked_in_at: "2026-05-20T09:00:00.000Z",
    };
    getSupabaseAdminMock.mockReturnValue(
      buildAdminMock({ participant: notCheckedIn, updateParticipant: afterUpdate })
    );

    const res = await POST_checkIn(makeRequest(), makeParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.checked_in_at).toBe(afterUpdate.checked_in_at);
    expect(body.data.message).toBe("Participant checked in successfully");
  });
});

// --------------------------------------------------------------------------
// check-out tests
// --------------------------------------------------------------------------

describe("POST check-out", () => {
  let POST_checkOut: typeof import("../check-out/route").POST;
  let getSupabaseAdminMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    getSupabaseAdminMock = getSupabaseAdmin as ReturnType<typeof vi.fn>;
    const mod = await import("../check-out/route");
    POST_checkOut = mod.POST;
  });

  it("returns 400 NOT_CHECKED_IN when participant has not been checked in", async () => {
    const notCheckedIn = {
      id: PARTICIPANT_ID,
      booking_id: BOOKING_ID,
      checked_in_at: null,
      checked_out_at: null,
    };
    getSupabaseAdminMock.mockReturnValue(buildAdminMock({ participant: notCheckedIn }));

    const res = await POST_checkOut(makeRequest(), makeParams());
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/not been checked in/i);
  });

  it("returns 200 with existing timestamp when participant is already checked out", async () => {
    const alreadyCheckedOut = {
      id: PARTICIPANT_ID,
      booking_id: BOOKING_ID,
      checked_in_at: "2026-05-20T08:00:00.000Z",
      checked_out_at: "2026-05-20T09:30:00.000Z",
    };
    getSupabaseAdminMock.mockReturnValue(buildAdminMock({ participant: alreadyCheckedOut }));

    const res = await POST_checkOut(makeRequest(), makeParams());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.checked_out_at).toBe(alreadyCheckedOut.checked_out_at);
    expect(body.data.message).toBe("Participant already checked out");
  });

  it("returns 404 when participant does not belong to the group", async () => {
    getSupabaseAdminMock.mockReturnValue(buildAdminMock({ participant: null }));

    const res = await POST_checkOut(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });
});
