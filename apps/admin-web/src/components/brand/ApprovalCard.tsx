import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

export type ApprovalRow = {
  id: string;
  subject_type: string;
  status: string;
  due_at: string | null;
  comment: string | null;
  approver_id: string | null;
};

export function ApprovalCard({ approval, onUpdated }: { approval: ApprovalRow; onUpdated: () => void }) {
  const decideMut = useMutation({
    mutationFn: (decision: "approved" | "changes_requested" | "rejected") =>
      adminApi.postJson(`/api/admin/brand/approvals/${approval.id}/decide`, { decision }),
    onSuccess: () => {
      adminToast.success("Decision saved");
      onUpdated();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (approval.status !== "pending") {
    return (
      <div className="rounded border p-3 text-sm">
        <p className="font-medium capitalize">{approval.subject_type.replace(/_/g, " ")}</p>
        <p className="text-zinc-600">Status: {approval.status}</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50/50 p-3 text-sm">
      <p className="font-medium capitalize">{approval.subject_type.replace(/_/g, " ")}</p>
      {approval.due_at ? <p className="text-xs text-zinc-500">Due {approval.due_at.slice(0, 16)}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded bg-violet-700 px-2 py-1 text-xs text-white" onClick={() => decideMut.mutate("approved")}>
          Approve
        </button>
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => decideMut.mutate("changes_requested")}>
          Changes
        </button>
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => decideMut.mutate("rejected")}>
          Reject
        </button>
      </div>
    </div>
  );
}
