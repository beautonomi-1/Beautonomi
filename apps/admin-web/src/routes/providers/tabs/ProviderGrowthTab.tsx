import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { str } from "./types";

type Props = {
  providerCanonicalId: string;
};

type GamificationBadgeRow = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  tier?: number | null;
  icon_url?: string | null;
  description?: string | null;
  color?: string | null;
};

type GamificationPayload = {
  total_points?: number;
  lifetime_points?: number;
  current_badge?: GamificationBadgeRow | GamificationBadgeRow[] | null;
  badge_earned_at?: string | null;
  last_calculated_at?: string | null;
  progress_to_next_badge?: {
    next_badge?: GamificationBadgeRow | null;
    points_needed?: number;
    progress_percent?: number;
  } | null;
  milestones?: { id?: string; milestone_type?: string; achieved_at?: string; metadata?: Record<string, unknown> | null }[];
  recent_transactions?: {
    id?: string;
    points?: number;
    source?: string;
    description?: string | null;
    created_at?: string;
  }[];
};

function normalizeBadge(b: GamificationPayload["current_badge"]): GamificationBadgeRow | null {
  if (b == null) return null;
  if (Array.isArray(b)) return (b[0] as GamificationBadgeRow) ?? null;
  return b as GamificationBadgeRow;
}

function formatPoints(n: unknown): string {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}

function formatNextBadgeProgress(p: GamificationPayload["progress_to_next_badge"]): { headline: string; detail: string } {
  if (!p?.next_badge) {
    return { headline: "Top tier", detail: "No higher badge configured, or max tier reached." };
  }
  const name = p.next_badge.name || p.next_badge.slug || "Next badge";
  const needed = p.points_needed ?? 0;
  const pct = p.progress_percent ?? 0;
  return {
    headline: `${name} · ${needed.toLocaleString()} pts to go`,
    detail: `${pct}% of points required for next tier`,
  };
}

export function ProviderGrowthTab({ providerCanonicalId }: Props) {
  const qc = useQueryClient();
  const [deductPoints, setDeductPoints] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [showDeduct, setShowDeduct] = useState(false);

  const gamificationQ = useQuery({
    queryKey: adminQueryKeys.providerGamification(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<GamificationPayload>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/gamification`,
        { timeoutMs: 30_000 },
      ),
    enabled: !!providerCanonicalId,
  });

  const deductPointsMutation = useMutation({
    mutationFn: (payload: { points: number; reason: string }) =>
      adminApi.postJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/gamification/deduct`,
        payload,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerGamification(providerCanonicalId) });
      adminToast.success("Points deducted successfully");
    },
    onError: (e: Error) => adminToast.error(`Failed to deduct points: ${e.message}`),
  });

  if (gamificationQ.isLoading) {
    return (
      <AdminPanel>
        <p className="text-sm text-gray-400">Loading gamification…</p>
      </AdminPanel>
    );
  }

  if (!gamificationQ.data) {
    return (
      <AdminPanel>
        <p className="text-sm text-gray-500">No gamification data available.</p>
      </AdminPanel>
    );
  }

  const g = gamificationQ.data;
  const badge = normalizeBadge(g.current_badge);
  const next = formatNextBadgeProgress(g.progress_to_next_badge);
  const milestones = g.milestones ?? [];
  const txs = g.recent_transactions ?? [];

  return (
    <div className="space-y-6">
      <AdminPanel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Gamification &amp; badges</h2>
            <p className="mt-1 text-sm text-gray-600">
              Points, current tier badge, and progress toward the next badge (same data the provider sees in-app).
            </p>
          </div>
          {providerCanonicalId && (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              onClick={() => setShowDeduct((v) => !v)}
            >
              {showDeduct ? "Cancel" : "Deduct Points"}
            </button>
          )}
        </div>

        {/* Point stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Total points", value: formatPoints(g.total_points), note: "Current balance" },
            { label: "Lifetime points", value: formatPoints(g.lifetime_points), note: "Earned all-time, never decreases" },
            { label: "Next badge", value: next.headline, note: next.detail },
            {
              label: "Recalculated",
              value: g.last_calculated_at ? new Date(String(g.last_calculated_at)).toLocaleString() : "—",
              note: g.badge_earned_at ? `Earned: ${new Date(String(g.badge_earned_at)).toLocaleDateString()}` : "Not yet earned",
            },
          ].map(({ label, value, note }) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-gray-900 leading-snug">{value}</div>
              <p className="mt-1 text-[11px] text-gray-500">{note}</p>
            </div>
          ))}
        </div>

        {/* Current badge card */}
        <div
          className={cn("mt-4 overflow-hidden rounded-xl border border-gray-200", badge?.color ? "" : "bg-white")}
          style={badge?.color ? {
            borderColor: `${badge.color}55`,
            background: `linear-gradient(135deg, ${badge.color}14 0%, white 48%)`,
          } : undefined}
        >
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
            {badge?.icon_url ? (
              <img
                src={String(badge.icon_url)}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
              />
            ) : (
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-lg font-bold text-gray-600"
                style={badge?.color ? { backgroundColor: `${badge.color}22`, borderColor: `${badge.color}44` } : undefined}
              >
                {badge?.name?.charAt(0) ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current badge</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{badge?.name ?? "No badge yet"}</p>
              <p className="mt-0.5 text-sm text-gray-600">
                {[badge?.slug ? `Slug: ${badge.slug}` : null, badge?.tier != null ? `Tier ${badge.tier}` : null]
                  .filter(Boolean).join(" · ") || "Assigns when point rules and recalculation run."}
              </p>
              {badge?.description ? (
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{badge.description}</p>
              ) : !badge ? (
                <p className="mt-2 text-sm text-gray-500">
                  No badge linked — provider may be new or below the first tier threshold.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Point deduction form */}
        {showDeduct && (
          <div className="mt-6 rounded-lg border border-red-100 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">Deduct points</p>
            <p className="text-xs text-red-700/90">
              Creates a negative transaction. Total points decrease; lifetime is not reduced.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="number"
                min="1"
                value={deductPoints}
                onChange={(e) => setDeductPoints(e.target.value)}
                placeholder="Points"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-32"
              />
              <input
                type="text"
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                placeholder="Reason (shown on transaction)"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={deductPointsMutation.isPending || !deductPoints || parseInt(deductPoints, 10) <= 0}
              onClick={() => {
                const pts = parseInt(deductPoints, 10);
                if (!isNaN(pts) && pts > 0) {
                  deductPointsMutation.mutate({ points: pts, reason: deductReason.trim() || "Admin deduction" });
                  setDeductPoints("");
                  setDeductReason("");
                  setShowDeduct(false);
                }
              }}
            >
              {deductPointsMutation.isPending ? "Processing…" : "Deduct Points"}
            </button>
          </div>
        )}
      </AdminPanel>

      {/* Transactions + milestones */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h3 className="text-sm font-semibold text-gray-900">Recent point transactions</h3>
          {txs.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No transactions yet.</p>
          ) : (
            <AdminDataTable className="mt-3">
              <AdminTableHead>
                <tr>
                  <AdminTh>When</AdminTh>
                  <AdminTh>Points</AdminTh>
                  <AdminTh>Source</AdminTh>
                  <AdminTh className="hidden sm:table-cell">Note</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {txs.map((t) => (
                  <tr key={str(t.id)}>
                    <AdminTd className="whitespace-nowrap text-xs">
                      {t.created_at ? new Date(String(t.created_at)).toLocaleString() : "—"}
                    </AdminTd>
                    <AdminTd className={cn("font-medium tabular-nums", (t.points ?? 0) < 0 ? "text-red-700" : "text-gray-900")}>
                      {(t.points ?? 0) > 0 ? "+" : ""}{t.points ?? "—"}
                    </AdminTd>
                    <AdminTd className="font-mono text-xs">{str(t.source)}</AdminTd>
                    <AdminTd className="hidden max-w-[12rem] truncate text-xs text-gray-600 sm:table-cell">
                      {str(t.description) || "—"}
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>

        <AdminPanel>
          <h3 className="text-sm font-semibold text-gray-900">Milestones ({milestones.length})</h3>
          {milestones.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No milestones recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {milestones.slice(0, 15).map((m) => (
                <li
                  key={str(m.id)}
                  className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                >
                  <span className="font-medium text-gray-800">{str(m.milestone_type).replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {m.achieved_at ? new Date(String(m.achieved_at)).toLocaleDateString() : "—"}
                  </span>
                </li>
              ))}
              {milestones.length > 15 && (
                <li className="text-xs text-gray-400 text-center">+{milestones.length - 15} more</li>
              )}
            </ul>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
