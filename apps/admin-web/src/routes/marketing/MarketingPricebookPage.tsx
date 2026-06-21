import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type PricebookItem = {
  channel: string;
  category: string;
  unit_cost_zar: number;
  description?: string | null;
};

type Payload = { items: PricebookItem[] };

export function MarketingPricebookPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing access is required.",
  );
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: adminQueryKeys.marketingPricebook(),
    queryFn: () => adminApi.getJson<Payload>("/api/admin/marketing/pricebook"),
    enabled: allowed,
  });

  const saveMut = useMutation({
    mutationFn: (items: PricebookItem[]) =>
      adminApi.patchJson("/api/admin/marketing/pricebook", { items }),
    onSuccess: () => {
      adminToast.success("Pricebook saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.marketingPricebook() });
    },
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Marketing pricebook" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const items = q.data?.items ?? [];

  const handleSave = () => {
    const patched = items.map((item) => {
      const key = `${item.channel}:${item.category}`;
      const raw = draft[key];
      if (raw == null || raw === "") return item;
      return { ...item, unit_cost_zar: Number(raw) };
    });
    saveMut.mutate(patched);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Marketing channel pricebook"
        description="Unit costs (ZAR) debited per platform marketing send. Transactional notifications are free."
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(saveMut.isPending)}
            disabled={saveMut.isPending}
            onClick={handleSave}
          >
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </button>
        }
      />

      <AdminPanel>
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Channel</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Unit cost (ZAR)</AdminTh>
              <AdminTh>Description</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {items.map((item) => {
              const key = `${item.channel}:${item.category}`;
              return (
                <tr key={key}>
                  <AdminTd>{item.channel}</AdminTd>
                  <AdminTd>{item.category}</AdminTd>
                  <AdminTd>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                      defaultValue={item.unit_cost_zar}
                      onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-600">{item.description ?? "—"}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      </AdminPanel>
    </div>
  );
}
