import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type SettlementRow = {
  id: string;
  period_start: string;
  period_end: string;
  region: string;
  currency: string;
  reported_proceeds: number;
  expected_proceeds: number;
  bank_deposit: number | null;
  variance: number;
  status: string;
  statement_reference: string | null;
  line_count: number;
  imported_at: string | null;
};

type SettlementsPayload = {
  items: SettlementRow[];
};

const zar = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

const SAMPLE_CSV = `period_start,period_end,region,currency,reported_proceeds,expected_proceeds,bank_deposit,status,statement_reference,apple_transaction_id,product_id,gross_amount,commission_amount,proceeds_amount
2026-01-01,2026-01-31,ZA,ZAR,10000,9800,9950,pending,JAN-2026,,,,,
2026-01-01,2026-01-31,ZA,ZAR,,,,,,1000000123456789,com.beautonomi.partner.sub.growth.monthly,119.99,18.00,101.99`;

export function AppleSettlementsPage() {
  useAdminDocumentTitle("Apple IAP Settlements");
  const { allowed, denied } = useSuperadminPage("Apple IAP settlements are superadmin-only.");
  void allowed;
  const qc = useQueryClient();
  const [csvText, setCsvText] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.appleSettlements(),
    queryFn: () =>
      adminApi.getJson<SettlementsPayload>("/api/admin/monetization/apple/settlements", { timeoutMs: 30_000 }),
  });

  const importCsv = useMutation({
    mutationFn: () => adminApi.postJson("/api/admin/monetization/apple/settlements", { csv: csvText }),
    onSuccess: async (res) => {
      const r = res as { settlements_upserted?: number; lines_inserted?: number };
      adminToast.success(
        `Imported ${r.settlements_upserted ?? 0} settlement(s), ${r.lines_inserted ?? 0} line(s)`,
      );
      setCsvText("");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleSettlements() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  const syncReports = useMutation({
    mutationFn: () =>
      adminApi.postJson<{
        imported?: number;
        skipped?: string[];
        errors?: string[];
        vendorConfigured?: boolean;
      }>("/api/admin/monetization/apple/settlements/sync", {}),
    onSuccess: async (res) => {
      if (!res.vendorConfigured) {
        adminToast.error("Set the App Store Connect vendor number under Integrations → Apple first.");
        return;
      }
      adminToast.success(
        `Synced ${res.imported ?? 0} report(s)${res.skipped?.length ? ` · skipped ${res.skipped.length}` : ""}`,
      );
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleSettlements() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Settlements" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple IAP Settlements"
        description="Apple financial report reconciliation. Sync pulls unpublished App Store Connect reports automatically; CSV remains for historic files."
      />
      <AdminMutationAlert
        errors={[
          importCsv.error instanceof Error ? importCsv.error : null,
          syncReports.error instanceof Error ? syncReports.error : null,
        ]}
      />

      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Import financial report</h2>
        <p className="mt-1 text-sm text-gray-600">
          Paste CSV with headers: period_start, period_end, reported_proceeds, expected_proceeds, and optional line
          columns (apple_transaction_id, product_id, gross_amount, commission_amount, proceeds_amount).
        </p>
        <textarea
          className="mt-3 min-h-[120px] w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
          value={csvText}
          placeholder={SAMPLE_CSV}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(importCsv.isPending) + " inline-flex items-center gap-2"}
            disabled={importCsv.isPending || !csvText.trim()}
            onClick={() => importCsv.mutate()}
          >
            <Upload className="h-4 w-4" />
            {importCsv.isPending ? "Importing…" : "Import CSV"}
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(syncReports.isPending) + " inline-flex items-center gap-2"}
            disabled={syncReports.isPending}
            onClick={() => syncReports.mutate()}
          >
            {syncReports.isPending ? "Syncing…" : "Sync from App Store Connect"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
            onClick={() => setCsvText(SAMPLE_CSV)}
          >
            Load sample
          </button>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-x-auto">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Settlement periods</h2>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No settlements imported yet.</p>
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Period</AdminTh>
                <AdminTh>Region</AdminTh>
                <AdminTh>Reported</AdminTh>
                <AdminTh>Expected</AdminTh>
                <AdminTh>Variance</AdminTh>
                <AdminTh>Bank deposit</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Lines</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((row) => (
                <tr key={row.id}>
                  <AdminTd className="text-xs">
                    {row.period_start} → {row.period_end}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {row.region} / {row.currency}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.reported_proceeds)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.expected_proceeds)}</AdminTd>
                  <AdminTd
                    className={`tabular-nums text-xs ${Math.abs(row.variance) > 0.01 ? "text-amber-800" : ""}`}
                  >
                    {zar(row.variance)}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.bank_deposit)}</AdminTd>
                  <AdminTd className="text-xs">{row.status}</AdminTd>
                  <AdminTd className="text-xs">{row.line_count}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
