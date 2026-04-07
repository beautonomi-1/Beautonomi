import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type CatRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  slug?: string;
  display_order?: number;
  is_featured?: boolean;
  is_active?: boolean;
  provider_count?: number;
};

export function GlobalCategoriesPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", icon: "" });

  const q = useQuery({
    queryKey: adminQueryKeys.globalCategories(),
    queryFn: () => adminApi.getJson<CatRow[]>("/api/admin/catalog/global-categories", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      adminApi.postJson<CatRow>("/api/admin/catalog/global-categories", {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        description: form.description.trim() || null,
        ...(form.icon.trim() ? { icon: form.icon.trim() } : {}),
      }),
    onSuccess: async () => {
      setForm({ name: "", slug: "", description: "", icon: "" });
      setMsg("Category created.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.globalCategories() });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Create failed"),
  });

  const putMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.putJson<CatRow>(`/api/admin/catalog/global-categories/${id}`, body),
    onSuccess: async () => {
      setMsg("Saved.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.globalCategories() });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Save failed"),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/catalog/global-categories/${id}`),
    onSuccess: async () => {
      setMsg("Category deactivated.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.globalCategories() });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Deactivate failed"),
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Global categories" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Global service categories"
        description="Platform-wide categories used for onboarding, ads targeting, and catalog. Changes apply per resolved admin tenant where data is scoped."
      />
      <AdminPanel className="border-slate-200 bg-slate-50/90">
        <p className="text-sm text-gray-800">
          <strong>Icon / image:</strong> set the optional <code className="rounded bg-white px-1 text-xs">icon</code> field to a{" "}
          <strong>public image URL</strong> (PNG/SVG/WebP hosted on your CDN or under{" "}
          <code className="rounded bg-white px-1 text-xs">/images/...</code> on the web app), or a short token your UI maps to an
          asset. It is stored on <code className="rounded bg-white px-1 text-xs">global_service_categories.icon</code>.
        </p>
      </AdminPanel>
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Add category</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm font-mono"
            placeholder="slug-kebab-case"
            value={form.slug}
            onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
          />
          <input
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm sm:col-span-2 lg:col-span-1"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
          <input
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm font-mono sm:col-span-2 lg:col-span-3"
            placeholder="Icon URL or token (optional) — e.g. https://…/category-nails.png"
            value={form.icon}
            onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
          />
        </div>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={createMut.isPending || !form.name.trim() || !form.slug.trim()}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? "Creating…" : "Create"}
        </button>
      </AdminPanel>

      {rows.length === 0 ? (
        <EmptyState title="No global categories" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Icon</AdminTh>
              <AdminTh>Order</AdminTh>
              <AdminTh>Providers</AdminTh>
              <AdminTh>Featured</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              return (
                <tr key={id}>
                  <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                  <AdminTd className="font-mono text-xs">{String(r.slug ?? "")}</AdminTd>
                  <AdminTd className="max-w-[14rem]">
                    <input
                      className="w-full rounded border border-gray-200 px-1 py-1 font-mono text-xs"
                      defaultValue={String(r.icon ?? "")}
                      placeholder="https://…"
                      title="Image URL or icon token"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        putMut.mutate({ id, body: { icon: v || null } });
                      }}
                    />
                  </AdminTd>
                  <AdminTd>
                    <input
                      type="number"
                      className="w-20 rounded border border-gray-200 px-1 py-1 text-sm"
                      defaultValue={Number(r.display_order ?? 0)}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isFinite(v)) return;
                        putMut.mutate({ id, body: { display_order: v } });
                      }}
                    />
                  </AdminTd>
                  <AdminTd className="tabular-nums">{String(r.provider_count ?? 0)}</AdminTd>
                  <AdminTd>
                    <input
                      type="checkbox"
                      defaultChecked={Boolean(r.is_featured)}
                      onChange={(e) => putMut.mutate({ id, body: { is_featured: e.target.checked } })}
                    />
                  </AdminTd>
                  <AdminTd>
                    <input
                      type="checkbox"
                      defaultChecked={r.is_active !== false}
                      onChange={(e) => putMut.mutate({ id, body: { is_active: e.target.checked } })}
                    />
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-sm font-medium text-rose-700 hover:underline"
                      onClick={() => {
                        if (confirm("Deactivate this category?")) deactivateMut.mutate(id);
                      }}
                    >
                      Deactivate
                    </button>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
