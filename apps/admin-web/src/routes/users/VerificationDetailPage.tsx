import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type VerificationDetail = Record<string, unknown> & {
  id?: string;
  status?: string;
  document_url?: string;
  rejection_reason?: string | null;
  user?: { full_name?: string; email?: string; phone?: string | null };
};

export function VerificationDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [rejectReason, setRejectReason] = useState("");
  const [docMsg, setDocMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.verificationDetail(id),
    queryFn: () => adminApi.getJson<VerificationDetail>(`/api/admin/verifications/${id}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const review = useMutation({
    mutationFn: async (body: { status: "approved" | "rejected"; rejection_reason?: string | null }) => {
      return adminApi.patchJson<VerificationDetail>(`/api/admin/verifications/${id}`, body);
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.verificationDetail(id) });
      await qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
      adminToast.success(vars.status === "approved" ? "Verification approved" : "Verification rejected");
    },
    onError: (e: Error) => adminToast.error(`Review failed: ${e.message}`),
  });

  const openDocument = async () => {
    setDocMsg(null);
    try {
      const res = await adminApi.getJson<{ signed_url?: string }>(
        `/api/admin/verifications/${id}/view`,
        { timeoutMs: 30_000 }
      );
      const url = res?.signed_url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setDocMsg("No signed URL returned.");
    } catch (e) {
      setDocMsg(e instanceof Error ? e.message : "Could not open document");
    }
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Verification" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const row = q.data;
  const status = String(row?.status ?? "");
  const pending = status === "pending" || status === "submitted" || status === "under_review";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Verification"
        description={
          <Link to={adminSpaTo("/admin/verifications")} className="text-sm font-medium text-primary hover:underline">
            ← Back to verifications
          </Link>
        }
      />
      <AdminPanel className="space-y-4">
        <div className="text-sm">
          <p>
            <span className="text-gray-500">User:</span>{" "}
            <span className="font-medium">{String(row?.user?.full_name ?? "—")}</span>
          </p>
          <p>
            <span className="text-gray-500">Email:</span> {String(row?.user?.email ?? "—")}
          </p>
          <p>
            <span className="text-gray-500">Status:</span> {status || "—"}
          </p>
        </div>
        {row?.document_url ? (
          <div>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void openDocument()}
            >
              Open verification document
            </button>
            {docMsg ? <p className="mt-2 text-sm text-amber-700">{docMsg}</p> : null}
          </div>
        ) : null}
        {pending ? (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-900">Review</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={review.isPending}
                onClick={() => review.mutate({ status: "approved" })}
              >
                Approve
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500">Rejection reason (required to reject)</label>
              <textarea
                className="mt-1 w-full max-w-lg rounded-lg border border-gray-200 px-2 py-2 text-sm"
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why (shown to the user)"
              />
              <button
                type="button"
                className="mt-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={review.isPending || !rejectReason.trim()}
                onClick={() => review.mutate({ status: "rejected", rejection_reason: rejectReason.trim() })}
              >
                Reject
              </button>
            </div>
            {review.error ? (
              <p className="text-sm text-rose-600">{review.error instanceof Error ? review.error.message : "Failed"}</p>
            ) : null}
          </div>
        ) : null}
      </AdminPanel>
    </div>
  );
}
