import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type BriefRow = {
  id: string;
  name: string;
  status: string;
  success_metric: string;
  budget_envelope: number | null;
  updated_at: string;
};

type BriefTemplateKey = "city_launch" | "seasonal_offer" | "provider_acquisition";

const TEMPLATE_OPTIONS: { key: BriefTemplateKey; label: string }[] = [
  { key: "city_launch", label: "City launch" },
  { key: "seasonal_offer", label: "Seasonal offer" },
  { key: "provider_acquisition", label: "Provider acquisition" },
];

export function BrandBriefsPage() {
  useAdminDocumentTitle("Brand briefs");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [templateKey, setTemplateKey] = useState<BriefTemplateKey>("city_launch");

  const q = useQuery({
    queryKey: adminQueryKeys.brandBriefs(),
    queryFn: () => adminApi.getJson<{ items: BriefRow[] }>("/api/admin/brand/briefs"),
    enabled: allowed,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<BriefRow>("/api/admin/brand/briefs", {
        name: "New campaign brief",
        template_key: templateKey,
        status: "draft",
      }),
    onSuccess: (row) => {
      adminToast.success("Brief created");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandBriefs() });
      navigate(adminSpaTo(`/admin/brand/briefs/${row.id}`));
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={8} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Briefs"
        description="Intake, review, and accept into the campaign board."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded border px-2 py-1.5 text-sm"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value as BriefTemplateKey)}
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
            >
              Start a brief
            </button>
          </div>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No briefs yet"
          description="Start from a template — city launch, seasonal offer, or provider acquisition."
          action={
            <button type="button" className="font-medium text-violet-700" onClick={() => createMut.mutate()}>
              Start a brief
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Success metric</AdminTh>
              <AdminTh className="text-right">Envelope</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <AdminTd>
                  <Link to={adminSpaTo(`/admin/brand/briefs/${r.id}`)} className="font-medium text-violet-700 hover:underline">
                    {r.name}
                  </Link>
                </AdminTd>
                <AdminTd>{r.status}</AdminTd>
                <AdminTd>{r.success_metric}</AdminTd>
                <AdminTd className="text-right tabular-nums">
                  {r.budget_envelope != null ? r.budget_envelope.toLocaleString() : "—"}
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
