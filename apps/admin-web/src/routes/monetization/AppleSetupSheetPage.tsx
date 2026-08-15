import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
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
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type SetupSheetProduct = {
  ascType: string;
  referenceName: string;
  productId: string;
  duration?: string;
  groupLevel?: number;
  webPriceZar: number;
  targetApplePriceZar: number;
  suggestedApplePricePoint: number;
  storedApplePriceZar: number | null;
  ascReportedPriceZar: number | null;
  displayName: string;
  description: string;
  isActive: boolean;
};

type SetupSheetPayload = {
  subscription_group: Record<string, string>;
  commission_rate: number;
  products: SetupSheetProduct[];
};

const zar = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

export function AppleSetupSheetPage() {
  useAdminDocumentTitle("Apple IAP Setup Sheet");
  const { allowed, denied } = useSuperadminPage("Apple IAP setup sheet is superadmin-only.");
  void allowed;

  const q = useQuery({
    queryKey: adminQueryKeys.appleSetupSheet(),
    queryFn: () =>
      adminApi.getJson<SetupSheetPayload>("/api/admin/monetization/apple/setup-sheet", { timeoutMs: 30_000 }),
  });

  const downloadCsv = useMutation({
    mutationFn: async () => {
      const blob = await adminApi.downloadBlob("/api/admin/monetization/apple/setup-sheet?format=csv", {
        timeoutMs: 60_000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "apple-iap-setup-sheet.csv";
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => adminToast.success("CSV downloaded"),
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Setup Sheet" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  if (!d?.products) return <AdminRetryBlock message="Empty response" onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple IAP Setup Sheet"
        description="Transcription reference for App Store Connect — subscriptions and consumable ad packs."
      />

      <AdminPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm text-gray-700">
            <p>
              Commission rate: <strong>{(d.commission_rate * 100).toFixed(1)}%</strong>
            </p>
            <p className="mt-1 text-gray-600">
              Group: {d.subscription_group.reference_name} · Grace period:{" "}
              {d.subscription_group.billing_grace_period}
            </p>
          </div>
          <button
            type="button"
            className={adminToolbarButtonClass(downloadCsv.isPending) + " inline-flex items-center gap-2"}
            disabled={downloadCsv.isPending}
            onClick={() => downloadCsv.mutate()}
          >
            <Download className="h-4 w-4" />
            Download CSV
          </button>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-x-auto">
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Type</AdminTh>
              <AdminTh>Product ID</AdminTh>
              <AdminTh>Reference name</AdminTh>
              <AdminTh>Web</AdminTh>
              <AdminTh>Target Apple</AdminTh>
              <AdminTh>Suggested tier</AdminTh>
              <AdminTh>Stored</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {d.products.map((p) => (
              <tr key={p.productId}>
                <AdminTd className="text-xs">{p.ascType}</AdminTd>
                <AdminTd className="max-w-[14rem] font-mono text-xs">{p.productId}</AdminTd>
                <AdminTd className="text-xs">{p.referenceName}</AdminTd>
                <AdminTd className="tabular-nums text-xs">{zar(p.webPriceZar)}</AdminTd>
                <AdminTd className="tabular-nums text-xs">{zar(p.targetApplePriceZar)}</AdminTd>
                <AdminTd className="tabular-nums text-xs">{zar(p.suggestedApplePricePoint)}</AdminTd>
                <AdminTd className="tabular-nums text-xs">{zar(p.storedApplePriceZar)}</AdminTd>
                <AdminTd>{p.isActive ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      </AdminPanel>
    </div>
  );
}
