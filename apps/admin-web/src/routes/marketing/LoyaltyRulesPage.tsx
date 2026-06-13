import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToast } from "@/lib/adminToast";

type LoyaltyRule = {
  id: string;
  currency?: string;
  points_per_currency_unit?: number;
  redemption_rate?: number;
  is_active?: boolean;
  effective_from?: string;
  effective_until?: string | null;
};

type Milestone = {
  id?: string;
  name?: string;
  description?: string | null;
  points_threshold?: number;
  reward_amount?: number;
  reward_currency?: string;
  is_active?: boolean;
};

type LoyaltyPointConfig = {
  id?: string;
  name?: string;
  redemption_rate?: number;
  min_redemption_points?: number | null;
  max_redemption_percentage?: number | null;
  is_active?: boolean | null;
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function LoyaltyRulesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();

  const rulesQ = useQuery({
    queryKey: adminQueryKeys.loyaltyRules(),
    queryFn: () => adminApi.getJson<LoyaltyRule[]>("/api/admin/loyalty/rules", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const milesQ = useQuery({
    queryKey: adminQueryKeys.loyaltyMilestones(),
    queryFn: () => adminApi.getJson<Milestone[]>("/api/admin/loyalty/milestones", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const configQ = useQuery({
    queryKey: adminQueryKeys.loyaltyConfig(),
    queryFn: () =>
      adminApi.getJson<{ config: LoyaltyPointConfig | null }>("/api/admin/loyalty/config", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [ppu, setPpu] = useState("");
  const [redemption, setRedemption] = useState("");
  const [currency, setCurrency] = useState("");

  const [mName, setMName] = useState("");
  const [mThreshold, setMThreshold] = useState("");
  const [mReward, setMReward] = useState("");
  const [mCurrency, setMCurrency] = useState("");

  const [cfgRedemption, setCfgRedemption] = useState("");
  const [cfgMinPoints, setCfgMinPoints] = useState("");
  const [cfgMaxPct, setCfgMaxPct] = useState("");

  const [editRule, setEditRule] = useState<LoyaltyRule | null>(null);
  const [ePpu, setEPpu] = useState("");
  const [eRedemption, setERedemption] = useState("");
  const [eCurrency, setECurrency] = useState("");
  const [eUntilLocal, setEUntilLocal] = useState("");
  const [eClearUntil, setEClearUntil] = useState(false);

  const [editMilestone, setEditMilestone] = useState<Milestone | null>(null);
  const [emName, setEmName] = useState("");
  const [emThreshold, setEmThreshold] = useState("");
  const [emReward, setEmReward] = useState("");
  const [emCurrency, setEmCurrency] = useState("");

  const createRule = useMutation({
    mutationFn: () =>
      adminApi.postJson<unknown>("/api/admin/loyalty/rules", {
        points_per_currency_unit: parseFloat(ppu),
        redemption_rate: parseFloat(redemption),
        ...(currency.trim() ? { currency: currency.trim() } : {}),
        is_active: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyRules() });
      setPpu("");
      setRedemption("");
      setCurrency("");
      adminToast.success("Loyalty rule created");
    },
    onError: (e: Error) => adminToast.error(`Failed to create rule: ${e.message}`),
  });

  const patchRule = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson<unknown>(`/api/admin/loyalty/rules/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyRules() });
      setEditRule(null);
      adminToast.success("Loyalty rule updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update rule: ${e.message}`),
  });

  const patchConfig = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson<unknown>("/api/admin/loyalty/config", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyConfig() });
      adminToast.success("Redemption settings saved");
    },
    onError: (e: Error) => adminToast.error(`Failed to save redemption settings: ${e.message}`),
  });

  const createMilestone = useMutation({
    mutationFn: () =>
      adminApi.postJson<unknown>("/api/admin/loyalty/milestones", {
        name: mName.trim(),
        points_threshold: parseInt(mThreshold, 10),
        reward_amount: parseFloat(mReward),
        reward_type: "wallet_credit",
        ...(mCurrency.trim() ? { reward_currency: mCurrency.trim() } : {}),
        is_active: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() });
      setMName("");
      setMThreshold("");
      setMReward("");
      setMCurrency("");
      adminToast.success("Milestone created");
    },
    onError: (e: Error) => adminToast.error(`Failed to create milestone: ${e.message}`),
  });

  const patchMilestone = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.putJson<unknown>(`/api/admin/loyalty/milestones/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() });
      setEditMilestone(null);
      adminToast.success("Milestone updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update milestone: ${e.message}`),
  });

  const deleteMilestone = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson<unknown>(`/api/admin/loyalty/milestones/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() });
      adminToast.success("Milestone deleted");
    },
    onError: (e: Error) => adminToast.error(`Failed to delete milestone: ${e.message}`),
  });

  const toggleMilestone = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.putJson<unknown>(`/api/admin/loyalty/milestones/${id}`, { is_active }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() });
      adminToast.success(vars.is_active ? "Milestone activated" : "Milestone deactivated");
    },
    onError: (e: Error) => adminToast.error(`Failed to toggle milestone: ${e.message}`),
  });

  function openEditRule(r: LoyaltyRule) {
    setEditRule(r);
    setEPpu(String(r.points_per_currency_unit ?? ""));
    setERedemption(String(r.redemption_rate ?? ""));
    setECurrency(String(r.currency ?? ""));
    setEClearUntil(false);
    if (r.effective_until) {
      try {
        const d = new Date(r.effective_until);
        const pad = (n: number) => String(n).padStart(2, "0");
        setEUntilLocal(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      } catch {
        setEUntilLocal("");
      }
    } else {
      setEUntilLocal("");
    }
  }

  function submitEditRule() {
    if (!editRule?.id) return;
    const ppuN = parseFloat(ePpu);
    const redN = parseFloat(eRedemption);
    if (Number.isNaN(ppuN) || Number.isNaN(redN)) return;
    const body: Record<string, unknown> = {
      points_per_currency_unit: ppuN,
      redemption_rate: redN,
      currency: eCurrency.trim() || editRule.currency,
    };
    if (eClearUntil) {
      body.effective_until = null;
    } else if (eUntilLocal.trim()) {
      body.effective_until = new Date(eUntilLocal).toISOString();
    }
    patchRule.mutate({ id: editRule.id, body });
  }

  function openEditMilestone(m: Milestone) {
    setEditMilestone(m);
    setEmName(String(m.name ?? ""));
    setEmThreshold(String(m.points_threshold ?? ""));
    setEmReward(String(m.reward_amount ?? ""));
    setEmCurrency(String(m.reward_currency ?? ""));
  }

  function submitEditMilestone() {
    if (!editMilestone?.id) return;
    const th = parseInt(emThreshold, 10);
    const rw = parseFloat(emReward);
    if (!emName.trim() || Number.isNaN(th) || Number.isNaN(rw)) return;
    patchMilestone.mutate({
      id: editMilestone.id,
      body: {
        name: emName.trim(),
        points_threshold: th,
        reward_amount: rw,
        reward_currency: emCurrency.trim() || undefined,
      },
    });
  }

  const loyaltyConfig = configQ.data?.config ?? null;

  useEffect(() => {
    if (!loyaltyConfig) return;
    setCfgRedemption(String(loyaltyConfig.redemption_rate ?? ""));
    setCfgMinPoints(String(loyaltyConfig.min_redemption_points ?? ""));
    setCfgMaxPct(String(loyaltyConfig.max_redemption_percentage ?? ""));
  }, [loyaltyConfig?.id, loyaltyConfig?.redemption_rate, loyaltyConfig?.min_redemption_points, loyaltyConfig?.max_redemption_percentage]);

  function submitRedemptionConfig() {
    const redemptionRate = parseFloat(cfgRedemption);
    const minPoints = parseInt(cfgMinPoints, 10);
    const maxPct = parseFloat(cfgMaxPct);
    if (Number.isNaN(redemptionRate) || redemptionRate <= 0) return;
    const body: Record<string, unknown> = { redemption_rate: redemptionRate };
    if (!Number.isNaN(minPoints) && minPoints >= 0) body.min_redemption_points = minPoints;
    if (!Number.isNaN(maxPct) && maxPct >= 0 && maxPct <= 100) body.max_redemption_percentage = maxPct;
    patchConfig.mutate(body);
  }

  if (denied) return denied;

  if (rulesQ.isLoading || milesQ.isLoading || configQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Loyalty" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  if (rulesQ.error) {
    if (isAdminApiAuthFailure(rulesQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={rulesQ.error.message} onRetry={() => void rulesQ.refetch()} />;
  }
  if (milesQ.error) {
    if (isAdminApiAuthFailure(milesQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={milesQ.error.message} onRetry={() => void milesQ.refetch()} />;
  }
  if (configQ.error) {
    if (isAdminApiAuthFailure(configQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={configQ.error.message} onRetry={() => void configQ.refetch()} />;
  }

  const ruleRows = rulesQ.data ?? [];
  const mileRows = Array.isArray(milesQ.data) ? milesQ.data : [];

  const ruleErr = createRule.error instanceof Error ? createRule.error.message : null;
  const mileErr = createMilestone.error instanceof Error ? createMilestone.error.message : null;
  const patchRuleErr = patchRule.error instanceof Error ? patchRule.error.message : null;
  const patchMileErr = patchMilestone.error instanceof Error ? patchMilestone.error.message : null;
  const patchConfigErr = patchConfig.error instanceof Error ? patchConfig.error.message : null;

  const cfgRedemptionValid = cfgRedemption.trim() !== "" && !Number.isNaN(parseFloat(cfgRedemption)) && parseFloat(cfgRedemption) > 0;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Loyalty"
        description="Earning rules control points on completed bookings. Checkout redemption uses the redemption settings below (loyalty_point_config); the redemption rate on earning rules is only a fallback when no active config exists."
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Redemption settings (checkout)</h2>
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-600">
            These values drive checkout redemption, balance previews, and redeem-to-wallet. Example: rate 10 means 10 points = 1 currency unit off.
          </p>
          {loyaltyConfig ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="text-gray-600">Redemption rate (points per 1 currency unit)</span>
                <input
                  className="ml-2 w-28 rounded border border-gray-300 px-2 py-1"
                  value={cfgRedemption}
                  onChange={(e) => setCfgRedemption(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="text-sm">
                <span className="text-gray-600">Min points to redeem</span>
                <input
                  className="ml-2 w-24 rounded border border-gray-300 px-2 py-1"
                  value={cfgMinPoints}
                  onChange={(e) => setCfgMinPoints(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="text-sm">
                <span className="text-gray-600">Max % of subtotal</span>
                <input
                  className="ml-2 w-20 rounded border border-gray-300 px-2 py-1"
                  value={cfgMaxPct}
                  onChange={(e) => setCfgMaxPct(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={patchConfig.isPending || !cfgRedemptionValid}
                onClick={() => submitRedemptionConfig()}
              >
                Save redemption settings
              </button>
            </div>
          ) : (
            <p className="text-sm text-amber-700">No active loyalty_point_config row found. Seed migration 124 should create one.</p>
          )}
          {patchConfigErr ? <p className="mt-2 text-sm text-red-600">{patchConfigErr}</p> : null}
        </AdminPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Earning rules</h2>
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-600">
            POST adds a new rule with effective_from = now. Currency defaults from the current market when omitted.
            Redemption rate here is a legacy fallback only — use redemption settings above for checkout.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="text-gray-600">Points / currency unit</span>
              <input
                className="ml-2 w-28 rounded border border-gray-300 px-2 py-1"
                value={ppu}
                onChange={(e) => setPpu(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Redemption rate</span>
              <input
                className="ml-2 w-28 rounded border border-gray-300 px-2 py-1"
                value={redemption}
                onChange={(e) => setRedemption(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Currency (optional)</span>
              <input
                className="ml-2 w-24 rounded border border-gray-300 px-2 py-1 uppercase"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="ZAR"
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={
                createRule.isPending || !ppu.trim() || !redemption.trim() || Number.isNaN(parseFloat(ppu)) || Number.isNaN(parseFloat(redemption))
              }
              onClick={() => createRule.mutate()}
            >
              Add rule
            </button>
          </div>
          {ruleErr ? <p className="mt-2 text-sm text-red-600">{ruleErr}</p> : null}
        </AdminPanel>
        {ruleRows.length === 0 ? (
          <EmptyState title="No loyalty rules" />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Currency</AdminTh>
                <AdminTh>Points / unit</AdminTh>
                <AdminTh>Redemption rate</AdminTh>
                <AdminTh>Active</AdminTh>
                <AdminTh>Effective from</AdminTh>
                <AdminTh>Until</AdminTh>
                <AdminTh className="w-44"> </AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ruleRows.map((r) => (
                <tr key={r.id}>
                  <AdminTd className="font-mono text-xs uppercase">{String(r.currency ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(r.points_per_currency_unit ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(r.redemption_rate ?? "")}</AdminTd>
                  <AdminTd>{r.is_active ? "Yes" : "No"}</AdminTd>
                  <AdminTd className="text-xs text-gray-700">{fmtTs(r.effective_from)}</AdminTd>
                  <AdminTd className="text-xs text-gray-700">{fmtTs(r.effective_until ?? undefined)}</AdminTd>
                  <AdminTd className="space-x-2">
                    <button
                      type="button"
                      className="text-sm text-gray-800 underline disabled:opacity-50"
                      disabled={patchRule.isPending || !r.id}
                      onClick={() =>
                        r.id &&
                        patchRule.mutate({
                          id: r.id,
                          body: { is_active: !r.is_active },
                        })
                      }
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" className="text-sm text-gray-800 underline" onClick={() => openEditRule(r)}>
                      Edit
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Milestones (wallet credit)</h2>
        <AdminPanel>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="text-gray-600">Name</span>
              <input
                className="ml-2 w-44 rounded border border-gray-300 px-2 py-1"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Points threshold</span>
              <input
                className="ml-2 w-24 rounded border border-gray-300 px-2 py-1"
                value={mThreshold}
                onChange={(e) => setMThreshold(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Reward amount</span>
              <input
                className="ml-2 w-24 rounded border border-gray-300 px-2 py-1"
                value={mReward}
                onChange={(e) => setMReward(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Currency (optional)</span>
              <input
                className="ml-2 w-20 rounded border border-gray-300 px-2 py-1 uppercase"
                value={mCurrency}
                onChange={(e) => setMCurrency(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={
                createMilestone.isPending ||
                !mName.trim() ||
                !mThreshold.trim() ||
                !mReward.trim() ||
                Number.isNaN(parseInt(mThreshold, 10)) ||
                Number.isNaN(parseFloat(mReward))
              }
              onClick={() => createMilestone.mutate()}
            >
              Add milestone
            </button>
          </div>
          {mileErr ? <p className="mt-2 text-sm text-red-600">{mileErr}</p> : null}
        </AdminPanel>
        {mileRows.length === 0 ? (
          <EmptyState title="No milestones" />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Threshold</AdminTh>
                <AdminTh>Reward</AdminTh>
                <AdminTh>Active</AdminTh>
                <AdminTh className="w-52"> </AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {mileRows.map((m) => (
                <tr key={String(m.id)}>
                  <AdminTd>{String(m.name ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(m.points_threshold ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">
                    {String(m.reward_amount ?? "")} {String(m.reward_currency ?? "")}
                  </AdminTd>
                  <AdminTd>{m.is_active ? "yes" : "no"}</AdminTd>
                  <AdminTd className="space-x-2">
                    {m.id ? (
                      <button
                        type="button"
                        className="text-sm text-gray-800 underline disabled:opacity-50"
                        disabled={toggleMilestone.isPending}
                        onClick={() => toggleMilestone.mutate({ id: m.id!, is_active: !m.is_active })}
                      >
                        {m.is_active ? "Deactivate" : "Activate"}
                      </button>
                    ) : null}
                    <button type="button" className="text-sm text-gray-800 underline" onClick={() => openEditMilestone(m)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-700 underline disabled:opacity-50"
                      disabled={deleteMilestone.isPending || !m.id}
                      onClick={() => {
                        if (m.id && window.confirm("Delete this milestone?")) deleteMilestone.mutate(m.id);
                      }}
                    >
                      Delete
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </section>

      <AdminModal
        open={!!editRule}
        onClose={() => setEditRule(null)}
        title="Edit loyalty rule"
        description="Updates the selected row. Set an end date to retire a rule after a point in time."
        footer={
          <>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" onClick={() => setEditRule(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={patchRule.isPending}
              onClick={() => submitEditRule()}
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="text-sm">
            Points / currency unit
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={ePpu} onChange={(e) => setEPpu(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            Redemption rate
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eRedemption} onChange={(e) => setERedemption(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            Currency
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase" value={eCurrency} onChange={(e) => setECurrency(e.target.value)} />
          </label>
          <label className="text-sm">
            Effective until (local)
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={eUntilLocal}
              onChange={(e) => setEUntilLocal(e.target.value)}
              disabled={eClearUntil}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={eClearUntil} onChange={(e) => setEClearUntil(e.target.checked)} />
            No end date (clear &quot;until&quot;)
          </label>
          {patchRuleErr ? <p className="text-sm text-red-600">{patchRuleErr}</p> : null}
        </div>
      </AdminModal>

      <AdminModal
        open={!!editMilestone}
        onClose={() => setEditMilestone(null)}
        title="Edit milestone"
        footer={
          <>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" onClick={() => setEditMilestone(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={patchMilestone.isPending}
              onClick={() => submitEditMilestone()}
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="text-sm">
            Name
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={emName} onChange={(e) => setEmName(e.target.value)} />
          </label>
          <label className="text-sm">
            Points threshold
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={emThreshold} onChange={(e) => setEmThreshold(e.target.value)} inputMode="numeric" />
          </label>
          <label className="text-sm">
            Reward amount
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={emReward} onChange={(e) => setEmReward(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            Currency
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase" value={emCurrency} onChange={(e) => setEmCurrency(e.target.value)} />
          </label>
          {patchMileErr ? <p className="text-sm text-red-600">{patchMileErr}</p> : null}
        </div>
      </AdminModal>
    </div>
  );
}
