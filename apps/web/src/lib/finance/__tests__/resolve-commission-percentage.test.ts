import { describe, expect, it } from "vitest";
import { resolveCommissionPercentageForProvider } from "../resolve-commission-percentage";

type SettingsRow = { tenant_id: string | null; settings: { payouts: Record<string, unknown> } };

function makeDb(opts: {
  settings: SettingsRow[];
  provider?: { tenant_id?: string | null; commission_override?: number | null };
}) {
  return {
    from(table: string) {
      if (table === "platform_settings") {
        let tenantFilter: { kind: "eq" | "null"; value?: string } | null = null;
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.eq = (col: string, value: unknown) => {
          if (col === "tenant_id") tenantFilter = { kind: "eq", value: value as string };
          return chain;
        };
        chain.is = (col: string) => {
          if (col === "tenant_id") tenantFilter = { kind: "null" };
          return chain;
        };
        chain.maybeSingle = () => {
          const row = opts.settings.find((s) =>
            tenantFilter?.kind === "eq" ? s.tenant_id === tenantFilter.value : s.tenant_id === null,
          );
          return Promise.resolve({ data: row ?? null, error: null });
        };
        return chain;
      }
      if (table === "providers") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: opts.provider ?? null, error: null });
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

const enabled = (pct: number) => ({ commission_enabled: true, platform_commission_percentage: pct });

describe("resolveCommissionPercentageForProvider", () => {
  it("uses the tenant row when present", async () => {
    const db = makeDb({
      settings: [
        { tenant_id: "t1", settings: { payouts: enabled(12) } },
        { tenant_id: null, settings: { payouts: enabled(20) } },
      ],
    });
    await expect(
      resolveCommissionPercentageForProvider(db as never, { tenantId: "t1", providerId: null }),
    ).resolves.toBe(12);
  });

  it("falls back to the global row when the tenant has none", async () => {
    const db = makeDb({ settings: [{ tenant_id: null, settings: { payouts: enabled(20) } }] });
    await expect(
      resolveCommissionPercentageForProvider(db as never, { tenantId: "t1", providerId: null }),
    ).resolves.toBe(20);
  });

  it("does not pick another tenant's row when no tenant resolves", async () => {
    const db = makeDb({ settings: [{ tenant_id: "other", settings: { payouts: enabled(30) } }] });
    await expect(
      resolveCommissionPercentageForProvider(db as never, { tenantId: null, providerId: null }),
    ).resolves.toBe(0);
  });

  it("applies provider override only when commission is enabled", async () => {
    const on = makeDb({
      settings: [{ tenant_id: "t1", settings: { payouts: enabled(12) } }],
      provider: { commission_override: 5 },
    });
    await expect(
      resolveCommissionPercentageForProvider(on as never, { tenantId: "t1", providerId: "p1" }),
    ).resolves.toBe(5);

    const off = makeDb({
      settings: [{ tenant_id: "t1", settings: { payouts: { commission_enabled: false } } }],
      provider: { commission_override: 5 },
    });
    await expect(
      resolveCommissionPercentageForProvider(off as never, { tenantId: "t1", providerId: "p1" }),
    ).resolves.toBe(0);
  });
});
