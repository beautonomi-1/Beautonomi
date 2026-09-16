import { useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminListToolbar } from "@/components/admin/AdminListToolbar";
import { AdminDataList, type AdminListColumn } from "@/components/admin/AdminDataList";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { activationGateLabels } from "@/lib/providerOpsActivationGates";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";

const PAGE_SIZE = 50;
const STAGE_TABS = [
  { key: "pending", label: "Pending Approval" },
  { key: "draft", label: "Drafts" },
  { key: "all", label: "All" },
] as const;

interface ActivationProvider {
  id: string; business_name: string; status: string; is_verified: boolean;
  created_at: string; owner_name: string | null; owner_email: string | null;
  days_waiting: number; ready_to_activate: boolean;
  activation_gates: {
    has_location: boolean;
    has_coordinates: boolean;
    has_business_name: boolean;
    is_verified: boolean;
  };
}

export function ProviderOpsActivationPage() {
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const search = sp.get("search") || "";
  const stage = sp.get("stage") || "pending";
  const [searchInput, setSearchInput] = useState(search);

  const qk = useMemo(
    () => adminQueryKeys.providerOps.activationQueue(`stage=${stage}|p=${page}|q=${search}`),
    [stage, page, search]
  );

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      p.set("stage", stage);
      p.set("page", String(page)); p.set("limit", String(PAGE_SIZE));
      return adminApi.getJson<{ data: ActivationProvider[]; meta: { total: number; has_more: boolean } }>(`/api/admin/provider-ops/activation-queue?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const approve = useMutation({
    mutationFn: (providerId: string) => adminApi.patchJson(`/api/admin/providers/${providerId}/status`, { status: "active" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      void qc.invalidateQueries({ queryKey: qk });
      invalidateAdminShellCounts(qc);
      adminToast.success("Provider activated successfully");
    },
    onError: (e: Error) => adminToast.error(`Activation failed: ${e.message}`),
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.meta?.total ?? 0;
  const hasMore = q.data?.meta?.has_more ?? false;

  const commitSearch = useCallback(
    (value: string) => {
      const n = new URLSearchParams(sp);
      if (value.trim()) n.set("search", value.trim());
      else n.delete("search");
      n.delete("page");
      setSp(n, { replace: true });
    },
    [sp, setSp],
  );
  function setStage(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "pending") n.delete("stage"); else n.set("stage", next);
    n.delete("page"); setSp(n, { replace: true });
  }

  const columns: AdminListColumn<ActivationProvider>[] = [
    {
      id: "business",
      header: "Provider",
      cell: (p) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{p.business_name}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {p.status.replace(/_/g, " ")}
            </span>
            {p.ready_to_activate ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Ready</span>
            ) : (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Blocked</span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {p.owner_name || p.owner_email} · {p.days_waiting}d waiting
          </p>
        </div>
      ),
    },
    {
      id: "gates",
      header: "Gates",
      cell: (p) => (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
          <Gate label="Name" ok={p.activation_gates.has_business_name} />
          <Gate label="Location" ok={p.activation_gates.has_location} />
          <Gate label="Verified" ok={p.activation_gates.is_verified} />
        </div>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (p) => new Date(p.created_at).toLocaleDateString(),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (p) => {
        const missingGates = activationGateLabels(p.activation_gates);
        return (
          <div className="flex flex-wrap gap-2">
            <Link to={adminSpaTo(`/admin/providers/${p.id}`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              View
            </Link>
            <button
              type="button"
              disabled={approve.isPending || !p.ready_to_activate}
              title={!p.ready_to_activate ? `Missing: ${missingGates.join(", ")}` : undefined}
              onClick={() => {
                requestConfirm({
                  title: "Confirm action",
                  consequence: `Activate ${p.business_name}?`,
                  variant: "primary",
                  confirmLabel: "Confirm",
                  onConfirm: async () => approve.mutate(p.id),
                });
              }}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Activate
            </button>
          </div>
        );
      },
    },
  ];

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Activation Queue" /><AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Activation Queue"
        description={
          stage === "draft"
            ? `${total} incomplete drafts (not yet submitted for review).`
            : stage === "all"
              ? `${total} drafts + pending providers. Activate after business name, location, and verification gates pass.`
              : `${total} providers awaiting approval. Activate after business name, location, and verification gates pass.`
        }
      />

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {STAGE_TABS.map((t) => (
            <button key={t.key} type="button" className={adminTabButtonClass(stage === t.key)} onClick={() => setStage(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminListToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by business name, owner…"
          hasActiveFilters={Boolean(search)}
          onClearFilters={() => {
            setSearchInput("");
            commitSearch("");
          }}
          actions={
            <button
              type="button"
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => commitSearch(searchInput)}
            >
              Search
            </button>
          }
        />
      </AdminPanel>

      <AdminDataList
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            title={
              stage === "draft"
                ? "No incomplete drafts"
                : stage === "all"
                  ? "No drafts or pending providers"
                  : "No providers pending approval"
            }
          />
        }
      />

      {total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
          <div className="flex gap-2">
            <button type="button" className={adminToolbarButtonClass(page <= 1)} disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page - 1)); setSp(n, { replace: true }); }}>Previous</button>
            <button type="button" className={adminToolbarButtonClass(!hasMore)} disabled={!hasMore} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); setSp(n, { replace: true }); }}>Next</button>
          </div>
        </div>
      )}
      <ConfirmDialog />

    </div>
  );
}

function Gate({ label, ok }: { label: string; ok: boolean }) {
  return <span className={`flex items-center gap-1 text-xs ${ok ? "text-green-600" : "text-red-500"}`}>{ok ? "✓" : "✗"} {label}</span>;
}
