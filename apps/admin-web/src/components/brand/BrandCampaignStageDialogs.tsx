import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";

export type StageChangeCampaign = {
  id: string;
  name: string;
  stage: BrandCampaignStage;
  updated_at: string;
  budget_envelope: number | null;
};

type ModalKind = "live" | "closed";

type BrandApproverOption = { id: string; name: string; email: string | null; role: string };

type Pending = {
  kind: ModalKind;
  campaign: StageChangeCampaign;
};

export function useBrandCampaignStageChange(opts?: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  const isSuperadmin = useAdminSession().bootstrap?.isSuperadmin ?? false;
  const [pending, setPending] = useState<Pending | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [closeout, setCloseout] = useState({ worked: "", did_not: "", run_again: "" });

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
    }) => adminApi.patchJson(`/api/admin/brand/campaigns/${input.id}/stage`, input),
    onSuccess: () => {
      adminToast.success("Stage updated");
      setPending(null);
      setSecondApproverId("");
      setCloseout({ worked: "", did_not: "", run_again: "" });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaigns() });
      opts?.onSuccess?.();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  function requestStageChange(campaign: StageChangeCampaign, next: BrandCampaignStage) {
    if (next === campaign.stage) return;
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
    pending == null ? null : (
      <>
        {pending.kind === "live" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-w-md rounded-lg bg-white p-4 shadow-lg">
              <h3 className="text-lg font-semibold">Confirm go-live</h3>
              <p className="mt-1 text-sm text-zinc-600">{pending.campaign.name}</p>
              {needsSecondApprover ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Budget exceeds {threshold.toLocaleString()}. A second marketing admin must confirm.
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">Placements and tracking will be treated as live.</p>
              )}
              {needsSecondApprover && (
                <label className="mt-3 block text-sm">
                  <span className="text-zinc-600">Second approver</span>
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
                  Go live
                </button>
              </div>
            </div>
          </div>
        )}
        {pending.kind === "closed" && (
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
