import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";
import { prevStage } from "@/lib/brandStageMoves";
import { ReadinessDrawer, type StageBlocker } from "@/components/brand/ReadinessDrawer";

export type StageChangeCampaign = {
  id: string;
  name: string;
  stage: BrandCampaignStage;
  updated_at: string;
  budget_envelope: number | null;
};

type ModalKind = "live" | "closed" | "backward";

type BrandApproverOption = { id: string; name: string; email: string | null; role: string };

type Pending = {
  kind: ModalKind;
  campaign: StageChangeCampaign;
  targetStage?: BrandCampaignStage;
};

type StageResponse = {
  stage: BrandCampaignStage;
  previous_stage: BrandCampaignStage;
  pending_go_live?: boolean;
  approval_id?: string;
};

export function useBrandCampaignStageChange(opts?: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  const isSuperadmin = useAdminSession().bootstrap?.isSuperadmin ?? false;
  const [pending, setPending] = useState<Pending | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [closeout, setCloseout] = useState({ worked: "", did_not: "", run_again: "" });
  const [backwardReason, setBackwardReason] = useState("");
  const [blockersOpen, setBlockersOpen] = useState<{ campaignId: string; target: BrandCampaignStage; blockers: StageBlocker[] } | null>(null);

  const settingsQ = useQuery({
    queryKey: [...adminQueryKeys.root, "brand", "settings"],
    queryFn: () =>
      adminApi.getJson<{ go_live_budget_threshold: number; stale_metric_days: number }>(
        "/api/admin/brand/settings",
      ),
    enabled: pending?.kind === "live",
  });

  const threshold = settingsQ.data?.go_live_budget_threshold ?? 50000;
  const needsSecondApprover =
    !isSuperadmin &&
    pending?.kind === "live" &&
    Number(pending.campaign.budget_envelope ?? 0) > threshold;

  const approversQ = useQuery({
    queryKey: [...adminQueryKeys.root, "brand", "marketing-admins"],
    queryFn: () =>
      adminApi.getJson<{ items: BrandApproverOption[] }>("/api/admin/brand/marketing-admins"),
    enabled: needsSecondApprover,
    staleTime: 60_000,
  });
  const approvers = approversQ.data?.items ?? [];

  const stageMut = useMutation({
    mutationFn: (input: {
      id: string;
      stage: BrandCampaignStage;
      expected_updated_at: string;
      second_approver_id?: string;
      closeout?: typeof closeout;
      reason?: string;
    }) => adminApi.patchJson<StageResponse>(`/api/admin/brand/campaigns/${input.id}/stage`, input),
    onSuccess: (data) => {
      if (data?.pending_go_live) {
        adminToast.success("Go-live sent for approval — campaign stays in creative until confirmed");
      } else {
        adminToast.success("Stage updated");
      }
      setPending(null);
      setSecondApproverId("");
      setBackwardReason("");
      setCloseout({ worked: "", did_not: "", run_again: "" });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaigns() });
      opts?.onSuccess?.();
    },
    onError: async (e: Error, variables) => {
      adminToast.error(e.message);
      try {
        const readiness = await adminApi.getJson<{
          ready: boolean;
          blockers: StageBlocker[];
        }>(
          `/api/admin/brand/campaigns/${variables.id}/readiness?target=${encodeURIComponent(variables.stage)}`,
        );
        if (!readiness.ready && readiness.blockers.length > 0) {
          setBlockersOpen({
            campaignId: variables.id,
            target: variables.stage,
            blockers: readiness.blockers,
          });
        }
      } catch {
        /* readiness fetch optional */
      }
    },
  });

  function requestStageChange(campaign: StageChangeCampaign, next: BrandCampaignStage) {
    if (next === campaign.stage) return;
    const back = prevStage(campaign.stage);
    if (back === next) {
      setPending({ kind: "backward", campaign, targetStage: next });
      return;
    }
    if (next === "live") {
      setPending({ kind: "live", campaign });
      return;
    }
    if (next === "closed") {
      setPending({ kind: "closed", campaign });
      return;
    }
    stageMut.mutate({
      id: campaign.id,
      stage: next,
      expected_updated_at: campaign.updated_at,
    });
  }

  const dialogs =
    pending == null && blockersOpen == null ? null : (
      <>
        {blockersOpen && (
          <ReadinessDrawer
            campaignId={blockersOpen.campaignId}
            targetStage={blockersOpen.target}
            blockers={blockersOpen.blockers}
            onClose={() => setBlockersOpen(null)}
          />
        )}
        {pending?.kind === "live" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-w-md rounded-lg bg-white p-4 shadow-lg">
              <h3 className="text-lg font-semibold">Confirm go-live</h3>
              <p className="mt-1 text-sm text-zinc-600">{pending.campaign.name}</p>
              {needsSecondApprover ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Budget exceeds {threshold.toLocaleString()}. The approver must confirm before the campaign goes live.
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">Placements and tracking will be treated as live.</p>
              )}
              {needsSecondApprover && (
                <label className="mt-3 block text-sm">
                  <span className="text-zinc-600">Assign approver</span>
                  {approversQ.isLoading ? (
                    <p className="mt-1 text-zinc-500">Loading marketing admins…</p>
                  ) : approversQ.error ? (
                    <p className="mt-1 text-red-700">{(approversQ.error as Error).message}</p>
                  ) : approvers.length === 0 ? (
                    <p className="mt-1 text-zinc-500">
                      No other marketing admin in this market. Ask a superadmin to add one.
                    </p>
                  ) : (
                    <select
                      className="mt-1 w-full rounded border px-2 py-1.5"
                      value={secondApproverId}
                      onChange={(e) => setSecondApproverId(e.target.value)}
                    >
                      <option value="">Choose an approver…</option>
                      {approvers.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.email && a.email !== a.name ? ` (${a.email})` : ""}
                          {a.role === "superadmin" ? " · superadmin" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() => {
                    setPending(null);
                    setSecondApproverId("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={stageMut.isPending || (needsSecondApprover && !secondApproverId)}
                  onClick={() =>
                    stageMut.mutate({
                      id: pending.campaign.id,
                      stage: "live",
                      expected_updated_at: pending.campaign.updated_at,
                      second_approver_id: needsSecondApprover ? secondApproverId : undefined,
                    })
                  }
                >
                  {needsSecondApprover ? "Request go-live" : "Go live"}
                </button>
              </div>
            </div>
          </div>
        )}
        {pending?.kind === "backward" && pending.targetStage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-w-md rounded-lg bg-white p-4 shadow-lg">
              <h3 className="text-lg font-semibold">Move stage back</h3>
              <p className="mt-1 text-sm text-zinc-600">
                {pending.campaign.name} → {pending.targetStage}
              </p>
              <label className="mt-3 block text-sm">
                Reason (required)
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  rows={3}
                  value={backwardReason}
                  onChange={(e) => setBackwardReason(e.target.value)}
                />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={stageMut.isPending || !backwardReason.trim()}
                  onClick={() =>
                    stageMut.mutate({
                      id: pending.campaign.id,
                      stage: pending.targetStage!,
                      expected_updated_at: pending.campaign.updated_at,
                      reason: backwardReason.trim(),
                    })
                  }
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
        {pending?.kind === "closed" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-w-lg rounded-lg bg-white p-4 shadow-lg">
              <h3 className="text-lg font-semibold">Close campaign</h3>
              <p className="mt-1 text-sm text-zinc-600">{pending.campaign.name}</p>
              {(["worked", "did_not", "run_again"] as const).map((k) => (
                <label key={k} className="mt-3 block text-sm">
                  {k.replace("_", " ")}
                  <textarea
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    rows={2}
                    value={closeout[k]}
                    onChange={(e) => setCloseout((c) => ({ ...c, [k]: e.target.value }))}
                  />
                </label>
              ))}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={stageMut.isPending}
                  onClick={() =>
                    stageMut.mutate({
                      id: pending.campaign.id,
                      stage: "closed",
                      expected_updated_at: pending.campaign.updated_at,
                      closeout,
                    })
                  }
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );

  return { requestStageChange, dialogs, isStagePending: stageMut.isPending };
}
