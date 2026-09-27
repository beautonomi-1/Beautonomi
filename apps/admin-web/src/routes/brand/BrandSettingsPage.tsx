import { useState } from "react";
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

type Settings = {
  go_live_budget_threshold: number;
  fiscal_year_start_month: number;
  stale_metric_days: number;
};

export function BrandSettingsPage() {
  useAdminDocumentTitle("Brand settings");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: [...adminQueryKeys.root, "brand", "settings"],
    queryFn: () => adminApi.getJson<Settings>("/api/admin/brand/settings"),
  });

  const [draft, setDraft] = useState<Settings | null>(null);
  const values = draft ?? q.data;

  const saveMut = useMutation({
    mutationFn: () => adminApi.patchJson("/api/admin/brand/settings", values),
    onSuccess: () => {
      adminToast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "brand", "settings"] });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (q.isLoading || !values) return <AdminPageSkeleton rows={4} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Brand desk settings" description="Per-market thresholds and pack cadence." />
      <AdminPanel title="Market settings">
        <form
          className="grid max-w-md gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <label className="block">
            Go-live budget threshold
            <input
              type="number"
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={values.go_live_budget_threshold}
              onChange={(e) =>
                setDraft({ ...values, go_live_budget_threshold: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            Fiscal year start month (1–12)
            <input
              type="number"
              min={1}
              max={12}
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={values.fiscal_year_start_month}
              onChange={(e) =>
                setDraft({ ...values, fiscal_year_start_month: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            Stale placement metric days
            <input
              type="number"
              min={1}
              max={90}
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={values.stale_metric_days}
              onChange={(e) => setDraft({ ...values, stale_metric_days: Number(e.target.value) })}
            />
          </label>
          <button type="submit" disabled={saveMut.isPending} className="rounded bg-violet-700 px-3 py-1.5 text-white">
            Save
          </button>
        </form>
      </AdminPanel>
    </div>
  );
}
