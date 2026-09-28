import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";

type Props = {
  strategyId: string;
  status: string;
  locked: boolean;
  onChanged: () => void;
};

export function StrategyStatusBar({ strategyId, status, locked, onChanged }: Props) {
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();

  const adminsQ = useQuery({
    queryKey: ["brand-marketing-admins"],
    queryFn: () =>
      adminApi.getJson<{ items: Array<{ id: string; full_name?: string; email?: string }> }>(
        "/api/admin/brand/marketing-admins",
      ),
  });

  const statusMut = useMutation({
    mutationFn: (body: { action: string; approver_id?: string; reason?: string }) =>
      adminApi.postJson(`/api/admin/brand/strategy/${strategyId}/status`, body),
    onSuccess: () => {
      adminToast.success("Strategy updated");
      onChanged();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const pdfUrl = `/api/admin/brand/strategy/${strategyId}/pdf`;

  return (
    <>
      <ConfirmDialog />
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase">{status}</span>
      {status === "draft" && !locked ? (
        <>
          <select
            className="rounded border px-2 py-1 text-sm"
            id="strategy-approver"
            defaultValue=""
          >
            <option value="">Submit to…</option>
            {(adminsQ.data?.items ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? a.email ?? a.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-1 text-sm text-white"
            onClick={() => {
              const el = document.getElementById("strategy-approver") as HTMLSelectElement | null;
              const approver_id = el?.value;
              if (!approver_id) {
                adminToast.error("Pick an approver");
                return;
              }
              statusMut.mutate({ action: "submit", approver_id });
            }}
          >
            Submit for approval
          </button>
        </>
      ) : null}
      {status === "approved" ? (
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          onClick={() =>
            requestConfirm({
              title: "Revise strategy",
              consequence: "Returns this strategy to draft so you can edit pillars and plans again.",
              confirmLabel: "Revise",
              reasonField: { label: "Reason for revise", required: true },
              onConfirm: ({ reason }) => statusMut.mutate({ action: "revise", reason }),
            })
          }
        >
          Revise
        </button>
      ) : null}
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm"
        onClick={() => {
          if (status === "approved") {
            requestConfirm({
              title: "Archive strategy",
              consequence: "Archived strategies stay visible when “Show archived” is on.",
              confirmLabel: "Archive",
              variant: "danger",
              reasonField: { label: "Archive reason", required: true },
              onConfirm: ({ reason }) => statusMut.mutate({ action: "archive", reason }),
            });
            return;
          }
          requestConfirm({
            title: "Archive strategy",
            consequence: "Archived strategies stay visible when “Show archived” is on.",
            confirmLabel: "Archive",
            variant: "danger",
            onConfirm: () => statusMut.mutate({ action: "archive" }),
          });
        }}
      >
        Archive
      </button>
      {status === "archived" ? (
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => statusMut.mutate({ action: "unarchive" })}>
          Unarchive
        </button>
      ) : null}
      <a href={pdfUrl} className="rounded border px-3 py-1 text-sm hover:bg-zinc-50">
        Export PDF
      </a>
    </div>
    </>
  );
}
