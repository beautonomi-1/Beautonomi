import { useState } from "react";
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

type Milestone = Record<string, unknown> & {
  id?: string;
  name?: string;
  points_threshold?: number;
  reward_amount?: number;
  reward_currency?: string;
  is_active?: boolean;
};

export function LoyaltyRulesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();

  const rulesQ = useQuery({
    queryKey: adminQueryKeys.loyaltyRules(),
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>("/api/admin/loyalty/rules", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const milesQ = useQuery({
    queryKey: adminQueryKeys.loyaltyMilestones(),
    queryFn: () => adminApi.getJson<Milestone[]>("/api/admin/loyalty/milestones", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [ppu, setPpu] = useState("");
  const [redemption, setRedemption] = useState("");
  const [currency, setCurrency] = useState("");

  const [mName, setMName] = useState("");
  const [mThreshold, setMThreshold] = useState("");
  const [mReward, setMReward] = useState("");
  const [mCurrency, setMCurrency] = useState("");

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
    },
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
    },
  });

  const deleteMilestone = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson<unknown>(`/api/admin/loyalty/milestones/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() }),
  });

  const toggleMilestone = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.putJson<unknown>(`/api/admin/loyalty/milestones/${id}`, { is_active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.loyaltyMilestones() }),
  });

  if (denied) return denied;

  if (rulesQ.isLoading || milesQ.isLoading) {
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

  const ruleRows = rulesQ.data ?? [];
  const mileRows = Array.isArray(milesQ.data) ? milesQ.data : [];
  const ruleCols = ruleRows[0] ? Object.keys(ruleRows[0]).slice(0, 8) : ["id", "currency", "is_active"];

  const ruleErr = createRule.error instanceof Error ? createRule.error.message : null;
  const mileErr = createMilestone.error instanceof Error ? createMilestone.error.message : null;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Loyalty"
        description="Earning rules and wallet-credit milestones. Uses Marketing & comms permissions."
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Earning rules</h2>
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-600">
            POST creates a new rule version (effective_from = now). Currency defaults from the market when omitted.
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
                {ruleCols.map((c) => (
                  <AdminTh key={c}>{c}</AdminTh>
                ))}
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ruleRows.map((r, i) => (
                <tr key={String((r as { id?: string }).id ?? i)}>
                  {ruleCols.map((c) => (
                    <AdminTd key={c} className="max-w-[10rem] truncate text-xs">
                      {String((r as Record<string, unknown>)[c] ?? "")}
                    </AdminTd>
                  ))}
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
                <AdminTh className="w-40"> </AdminTh>
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
    </div>
  );
}
