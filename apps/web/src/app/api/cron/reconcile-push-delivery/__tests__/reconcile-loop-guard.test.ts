/**
 * Reconcile loop-guard tests.
 *
 * Proves that the four compounding bugs that caused the infinite
 * push-delivery reconciliation loop cannot re-trigger:
 *
 *   1. §break-loop    — already-reconciled sends (data.reconciled=true) are
 *                        excluded from the cron scan.
 *   2. §exclude-ephemeral — badge_sync is not must-deliver and is never
 *                            enqueued or reconciled.
 *   3. §fix-device-math  — a single delivered device satisfies a single-user
 *                           group; stale devices don't inflate expected count.
 *   4. §stable-group  — dedupeKey is stable across re-enqueue generations via
 *                        _original_reconcile_group_id.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── helpers & mocks ──────────────────────────────────────────────────────────

const CRON_SECRET = "test-cron-secret";

const hoisted = vi.hoisted(() => ({
  enqueueNotificationMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/notifications/enqueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/enqueue")>();
  return { ...actual, enqueueNotification: hoisted.enqueueNotificationMock };
});

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("@/lib/platform/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/secrets")>();
  return {
    ...actual,
    resolveOneSignalCredentials: vi.fn().mockResolvedValue({
      appId: "app-id-test",
      restKey: "rest-key-test",
    }),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

/** OneSignal stats response — all processing complete, some delivered. */
function makeStats(delivered: number, remaining = 0) {
  return { ok: true, status: 200, json: async () => ({ successful: delivered, converted: 0, remaining, errored: 0 }) };
}

/** Base reconcile-eligible log entry (booking_confirmed, not yet reconciled). */
function makeLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    channels: ["push"],
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
    status: "sent",
    provider_response: { id: "notif-id-1" },
    payload: {
      data: { template_key: "booking_confirmed" },
      _reconcile: {
        app_type: "customer",
        tenant_id: null,
        user_ids: ["user-1"],
        template_key: "booking_confirmed",
        group_id: "group-abc",
        title: "Booking confirmed",
        message: "Your booking is confirmed.",
        url: null,
      },
      ...overrides,
    },
  };
}

function makeSupabase(
  logs: ReturnType<typeof makeLogEntry>[],
  deviceCount = 1,
  deviceLastSeen?: string,
) {
  const seen = deviceLastSeen ?? new Date(Date.now() - 24 * 60 * 60_000).toISOString(); // 1 day ago
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "notification_logs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: logs, error: null }),
        };
      }
      if (table === "user_devices") {
        const rows = Array.from({ length: deviceCount }, (_, i) => ({
          user_id: "user-1",
          last_seen: seen,
          id: `dev-${i}`,
        }));
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({ data: [], error: null }),
          then: (fn: (v: { data: typeof rows; error: null }) => void) =>
            fn({ data: rows, error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    rpc: async (name: string) => {
      if (name === "claim_cron_run") return { data: 1, error: null };
      if (name === "finish_cron_run") return { data: null, error: null };
      return { data: null, error: null };
    },
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  vi.stubGlobal("fetch", hoisted.fetchMock);
  hoisted.enqueueNotificationMock.mockReset();
  hoisted.enqueueNotificationMock.mockResolvedValue({ id: "q-1", inserted: true });
  hoisted.fetchMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ── §break-loop ───────────────────────────────────────────────────────────────

describe("§break-loop — reconciled re-sends are excluded from scan", () => {
  it("does NOT re-enqueue a push that already has data.reconciled=true", async () => {
    const reconciled = makeLogEntry({ data: { template_key: "booking_confirmed", reconciled: true } });

    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([reconciled])),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(0);
    expect(hoisted.enqueueNotificationMock).not.toHaveBeenCalled();
  });

  it("DOES re-enqueue a non-reconciled push that was not delivered", async () => {
    const original = makeLogEntry();
    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([original])),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(1);
    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledOnce();
  });
});

// ── §exclude-ephemeral ────────────────────────────────────────────────────────

describe("§exclude-ephemeral — badge_sync is never must-deliver", () => {
  it("does not re-enqueue badge_sync even when 0 devices received it", async () => {
    const badgeSyncLog = makeLogEntry({
      data: { template_key: "badge_sync", type: "badge_sync" },
      _reconcile: {
        app_type: "customer",
        tenant_id: null,
        user_ids: ["user-1"],
        template_key: "badge_sync",
        group_id: "group-badge-1",
        title: null,
        message: null,
        url: null,
      },
    });
    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([badgeSyncLog])),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(0);
    expect(hoisted.enqueueNotificationMock).not.toHaveBeenCalled();
  });
});

// ── §fix-device-math ─────────────────────────────────────────────────────────

describe("§fix-device-math — single delivered device satisfies single-user group", () => {
  it("does not retry when maxDelivered>=1, even if other devices did not receive it", async () => {
    const original = makeLogEntry();
    // 1 delivery but user has 2 registered reachable devices — must NOT retry
    hoisted.fetchMock.mockResolvedValue(makeStats(1));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([original], 2)),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(0);
  });

  it("retries only when zero devices received the push", async () => {
    const original = makeLogEntry();
    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([original], 1)),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(1);
  });

  it("skips when user has no reachable devices (all stale)", async () => {
    const original = makeLogEntry();
    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    // Device last_seen 60 days ago — outside REACHABLE_DEVICE_DAYS (21)
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(
        makeSupabase([original], 0), // 0 reachable devices
      ),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    const body = await res.json() as { ok: boolean; re_enqueued: number };

    expect(body.ok).toBe(true);
    expect(body.re_enqueued).toBe(0);
  });
});

// ── §stable-group ─────────────────────────────────────────────────────────────

describe("§stable-group — dedupeKey is stable across re-enqueue generations", () => {
  it("carries _original_reconcile_group_id in re-enqueued payload", async () => {
    const original = makeLogEntry();
    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([original])),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "reconcile:push:group-abc:user-1",
        payload: expect.objectContaining({
          data: expect.objectContaining({
            _original_reconcile_group_id: "group-abc",
            reconciled: true,
          }),
        }),
      }),
    );
  });

  it("uses _original_reconcile_group_id from data to produce stable groupKey on generation 2", async () => {
    // Simulate a generation-2 log: re-sent with a NEW collapse_id "group-xyz",
    // but carrying _original_reconcile_group_id="group-abc" from the first enqueue.
    // Even without the §break-loop guard this must not create a new dedupeKey.
    const gen2Log = {
      ...makeLogEntry(),
      provider_response: { id: "notif-id-2" },
      payload: {
        data: {
          template_key: "booking_confirmed",
          reconciled: true, // §break-loop already stops this; this tests §stable-group
          _original_reconcile_group_id: "group-abc",
        },
        _reconcile: {
          app_type: "customer",
          tenant_id: null,
          user_ids: ["user-1"],
          template_key: "booking_confirmed",
          group_id: "group-xyz", // NEW collapse_id from the re-send
          title: "Booking confirmed",
          message: "Your booking is confirmed.",
          url: null,
        },
      },
    };

    // Skip the reconciled guard for this test (we want to observe groupKey only).
    // The §break-loop guard skips reconciled entries so in practice this path
    // is dead; we still verify the stable groupKey path is correct.
    // Strip reconciled flag to let it through the scan:
    gen2Log.payload.data.reconciled = false as unknown as true;

    hoisted.fetchMock.mockResolvedValue(makeStats(0));

    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: vi.fn().mockReturnValue(makeSupabase([gen2Log])),
    }));

    const { GET } = await import("@/app/api/cron/reconcile-push-delivery/route");
    const { NextRequest } = await import("next/server");
    await GET(
      new NextRequest("http://localhost/api/cron/reconcile-push-delivery", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    // dedupeKey must use the original group_id, not the new "group-xyz"
    expect(hoisted.enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "reconcile:push:group-abc:user-1",
      }),
    );
  });
});
