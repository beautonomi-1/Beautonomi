import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { briefToFormValues } from "@/routes/brand/BrandBriefEditForm";
import { BrandBriefWizard } from "@/components/brand/BrandBriefWizard";

export function BrandBriefDetailPage() {
  const { id } = useParams<{ id: string }>();
  useAdminDocumentTitle("Brand brief");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: adminQueryKeys.brandBrief(id!),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/brand/briefs/${id}`),
    enabled: !!id,
  });

  const reviewMut = useMutation({
    mutationFn: (action: string) =>
      adminApi.postJson<{ campaignId?: string }>(`/api/admin/brand/briefs/${id}/review`, { action }),
    onSuccess: (data) => {
      adminToast.success("Updated");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandBrief(id!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandBriefs() });
      const campaignId = data?.campaignId;
      if (campaignId) {
        navigate(adminSpaTo(`/admin/brand/campaigns/${campaignId}`));
      }
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const brief = q.data!;
  const status = String(brief.status ?? "");
  const editable = !["accepted", "rejected"].includes(status);

  return (
    <div className="space-y-4">
      <AdminPageHeader title={String(brief.name)} description={`Status: ${status}`} />
      <AdminPanel title="Next action">
        <div className="flex flex-wrap gap-2">
          {status === "draft" && (
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => reviewMut.mutate("submit")}>
              Submit for review
            </button>
          )}
          {(status === "submitted" || status === "changes_requested") && (
            <>
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => reviewMut.mutate("start_review")}>
                Start review
              </button>
              <button
                type="button"
                className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white"
                onClick={() => reviewMut.mutate("accept")}
              >
                Accept → create campaign
              </button>
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => reviewMut.mutate("request_changes")}>
                Request changes
              </button>
            </>
          )}
          {status === "in_review" && (
            <>
              <button
                type="button"
                className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white"
                onClick={() => reviewMut.mutate("accept")}
              >
                Accept
              </button>
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => reviewMut.mutate("request_changes")}>
                Request changes
              </button>
            </>
          )}
        </div>
      </AdminPanel>
      <AdminPanel title={editable ? "Edit brief" : "Brief (read-only)"}>
        <BrandBriefWizard
          briefId={id!}
          initial={briefToFormValues(brief)}
          readOnly={!editable}
          onSaved={() => void q.refetch()}
        />
      </AdminPanel>
      {Array.isArray(brief.brand_activity) && brief.brand_activity.length > 0 && (
        <AdminPanel title="Activity">
          <ul className="space-y-2 text-sm">
            {(brief.brand_activity as Array<{ id: string; kind: string; body: string | null; created_at: string }>).map(
              (a) => (
                <li key={a.id} className="border-b border-zinc-100 pb-2">
                  <span className="text-xs text-zinc-500">{a.created_at.slice(0, 16)}</span>
                  <span className="ml-2 font-medium">{a.kind}</span>
                  {a.body ? <p>{a.body}</p> : null}
                </li>
              ),
            )}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
