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
  user_id?: string;
  document_type?: string;
  country?: string;
  status?: string;
  document_url?: string | null;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  user?: { full_name?: string; email?: string; phone?: string | null };
  provider?: {
    id?: string;
    business_name?: string | null;
    slug?: string | null;
    verification_status?: string | null;
    relationship?: "owner" | "staff";
  } | null;
};

const PROVIDER_STATUS_BADGE: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
  verified: "bg-blue-100 text-blue-700",
  pending: "bg-zinc-100 text-zinc-700",
  in_review: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-red-100 text-red-700",
};

const PROVIDER_RELATIONSHIP_BADGE: Record<string, string> = {
  owner: "bg-indigo-100 text-indigo-700",
  staff: "bg-zinc-100 text-zinc-700",
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

  const resetIdentity = useMutation({
    mutationFn: async (userId: string) => {
      return adminApi.postJson<{ message?: string }>(
        `/api/admin/users/${encodeURIComponent(userId)}/identity-verification/reset`,
        {},
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.verificationDetail(id) });
      await qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
      adminToast.success("Customer can submit identity verification again.");
    },
    onError: (e: Error) => adminToast.error(`Reset failed: ${e.message}`),
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
  const subjectUserId = typeof row?.user_id === "string" ? row.user_id : "";
  const provider = row?.provider ?? null;
  const providerStatus = provider?.verification_status ?? null;
  const providerStatusCls = providerStatus
    ? PROVIDER_STATUS_BADGE[providerStatus] ?? "bg-gray-100 text-gray-700"
    : null;
  const providerRelationship = provider?.relationship ?? null;
  const providerRelCls = providerRelationship
    ? PROVIDER_RELATIONSHIP_BADGE[providerRelationship] ?? "bg-gray-100 text-gray-700"
    : null;

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
            {subjectUserId ? (
              <>
                {" "}
                <Link
                  to={adminSpaTo(`/admin/users/${encodeURIComponent(subjectUserId)}`)}
                  className="font-medium text-primary hover:underline"
                >
                  View profile
                </Link>
              </>
            ) : null}
          </p>
          <p>
            <span className="text-gray-500">Email:</span> {String(row?.user?.email ?? "—")}
          </p>
          <p>
            <span className="text-gray-500">Status:</span> {status || "—"}
          </p>
          {row?.document_type ? (
            <p>
              <span className="text-gray-500">Document type:</span> {String(row.document_type)}
            </p>
          ) : null}
          {row?.country ? (
            <p>
              <span className="text-gray-500">Country:</span> {String(row.country)}
            </p>
          ) : null}
          {row?.submitted_at ? (
            <p>
              <span className="text-gray-500">Submitted:</span> {String(row.submitted_at)}
            </p>
          ) : null}
        </div>
        {provider?.id ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Linked provider</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Link
                to={adminSpaTo(`/admin/provider-ops/providers/${encodeURIComponent(String(provider.id))}`)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {provider.business_name || "Unnamed business"}
              </Link>
              {providerRelationship && providerRelCls ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${providerRelCls}`}>
                  {providerRelationship}
                </span>
              ) : null}
              {providerStatus && providerStatusCls ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${providerStatusCls}`}>
                  {providerStatus.replace(/_/g, " ")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Approving here also syncs the provider&apos;s KYC status. Open the lifecycle page to manage the marketplace
              badge or onboarding state.
            </p>
          </div>
        ) : null}
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
        ) : (
          <p className="text-sm text-gray-600">
            No uploaded file on this record (for example Sumsub automated verification). Use Sumsub or reset below so the
            customer can re-verify.
          </p>
        )}
        {subjectUserId ? (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-900">Re-verification</p>
            <p className="mt-1 text-sm text-gray-600">
              Clears the user&apos;s identity flags and closes any in-flight verification rows so they can submit again.
              History rows remain for audit.
            </p>
            <button
              type="button"
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              disabled={resetIdentity.isPending}
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm(
                    "Reset this user's identity verification state? They will be able to upload or run Sumsub again.",
                  )
                ) {
                  return;
                }
                resetIdentity.mutate(subjectUserId);
              }}
            >
              {resetIdentity.isPending ? "Resetting…" : "Reset identity verification"}
            </button>
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
