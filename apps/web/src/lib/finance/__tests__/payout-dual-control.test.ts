import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAYOUT_DUAL_CONTROL,
  evaluatePayoutApproval,
  evaluatePayoutTransfer,
  readPayoutDualControlSettings,
  resolvePayoutDualControlSettings,
} from "../payout-dual-control";

const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROVIDER_USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("F2-20 payout dual control — approval", () => {
  it("blocks the requester from approving their own payout", () => {
    const res = evaluatePayoutApproval({ actorId: ADMIN_A, requestedBy: ADMIN_A });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("allows a different admin to approve", () => {
    expect(evaluatePayoutApproval({ actorId: ADMIN_A, requestedBy: PROVIDER_USER }).ok).toBe(true);
    expect(evaluatePayoutApproval({ actorId: ADMIN_A, requestedBy: null }).ok).toBe(true);
  });
});

describe("F2-20 payout dual control — transfer", () => {
  const settings = { enabled: true, threshold_major: 10_000 };

  it("lets the approving admin also initiate a transfer under the threshold", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_A,
      approvedBy: ADMIN_A,
      requestedBy: PROVIDER_USER,
      amount: 9_999.99,
      settings,
    });
    expect(res.ok).toBe(true);
  });

  it("requires a second admin at or above the threshold", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_A,
      approvedBy: ADMIN_A,
      requestedBy: PROVIDER_USER,
      amount: 10_000,
      settings,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("SECOND_APPROVER_REQUIRED");
      expect(res.status).toBe(403);
    }
  });

  it("requires an approver on record for amounts above the threshold", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_A,
      approvedBy: null,
      requestedBy: PROVIDER_USER,
      amount: 25_000,
      settings,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SECOND_APPROVER_REQUIRED");
  });

  it("allows a different admin to move the money above the threshold", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_B,
      approvedBy: ADMIN_A,
      requestedBy: PROVIDER_USER,
      amount: 250_000,
      settings,
    });
    expect(res.ok).toBe(true);
  });

  it("never lets the requester initiate the transfer, regardless of amount", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_A,
      approvedBy: ADMIN_B,
      requestedBy: ADMIN_A,
      amount: 1,
      settings,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("skips the second-approver rule only when explicitly disabled in settings", () => {
    const res = evaluatePayoutTransfer({
      actorId: ADMIN_A,
      approvedBy: ADMIN_A,
      requestedBy: PROVIDER_USER,
      amount: 1_000_000,
      settings: { enabled: false, threshold_major: 10_000 },
    });
    expect(res.ok).toBe(true);
  });
});

describe("F2-20 payout dual control — settings", () => {
  it("defaults to enabled with a 10,000 major-unit threshold", () => {
    expect(DEFAULT_PAYOUT_DUAL_CONTROL).toEqual({ enabled: true, threshold_major: 10_000 });
    expect(readPayoutDualControlSettings(null)).toEqual(DEFAULT_PAYOUT_DUAL_CONTROL);
    expect(readPayoutDualControlSettings({ finance: {} })).toEqual(DEFAULT_PAYOUT_DUAL_CONTROL);
  });

  it("reads finance.payout_dual_control from platform_settings and ignores garbage", () => {
    expect(
      readPayoutDualControlSettings({
        finance: { payout_dual_control: { enabled: false, threshold_major: 2_500 } },
      }),
    ).toEqual({ enabled: false, threshold_major: 2_500 });
    expect(
      readPayoutDualControlSettings({
        finance: { payout_dual_control: { enabled: "yes", threshold_major: -5 } },
      }),
    ).toEqual(DEFAULT_PAYOUT_DUAL_CONTROL);
  });

  it("tenant row overrides the global row", async () => {
    const rows: Record<string, unknown> = {
      global: { finance: { payout_dual_control: { threshold_major: 5_000 } } },
      tenant: { finance: { payout_dual_control: { threshold_major: 500 } } },
    };
    const makeQuery = (scope: "global" | "tenant") => {
      const q: any = {};
      const chain = () => q;
      q.select = vi.fn(chain);
      q.eq = vi.fn(chain);
      q.is = vi.fn(chain);
      q.order = vi.fn(chain);
      q.limit = vi.fn(chain);
      q.maybeSingle = vi.fn(async () => ({ data: { id: scope, settings: rows[scope] }, error: null }));
      return q;
    };
    let call = 0;
    const supabase = {
      from: vi.fn(() => makeQuery(call++ === 0 ? "tenant" : "global")),
    } as any;
    const settings = await resolvePayoutDualControlSettings(supabase, "tenant-1");
    expect(settings).toEqual({ enabled: true, threshold_major: 500 });
  });

  it("falls back to defaults when platform_settings cannot be read", async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error("boom");
      }),
    } as any;
    await expect(resolvePayoutDualControlSettings(supabase, "tenant-1")).resolves.toEqual(
      DEFAULT_PAYOUT_DUAL_CONTROL,
    );
  });
});
