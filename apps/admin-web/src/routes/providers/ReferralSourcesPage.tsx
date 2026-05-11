import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
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

type ProviderRow = { id: string; business_name?: string; name?: string };
type SourceRow = { id: string; name?: string; description?: string | null; is_active?: boolean };

export function ReferralSourcesPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const providersQ = useQuery({
    queryKey: [...adminQueryKeys.providers.all(), "referral-sources-picker"],
    // /api/admin/providers returns successResponse({ data: [...], meta: {...} }) so after the
    // client's one-level unwrap the result is { data: ProviderRow[], meta: unknown }.
    // We normalise to a plain array here so the rest of the component can stay simple.
    queryFn: async () => {
      const res = await adminApi.getJson<{ data: ProviderRow[] }>("/api/admin/providers", { timeoutMs: 60_000 });
      return res.data ?? [];
    },
    enabled: allowed,
  });

  const sourcesQ = useQuery({
    queryKey: adminQueryKeys.referralSources(providerId || "none"),
    queryFn: () =>
      adminApi.getJson<SourceRow[]>(
        `/api/admin/referral-sources?provider_id=${encodeURIComponent(providerId)}`,
        { timeoutMs: 60_000 }
      ),
    enabled: allowed && !!providerId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<SourceRow>("/api/admin/referral-sources", {
        provider_id: providerId,
        name: name.trim(),
        description: description.trim() || undefined,
        is_active: true,
      }),
    onSuccess: async () => {
      setName("");
      setDescription("");
      setMsg("Source created.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referralSources(providerId) });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Create failed"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson<SourceRow>(`/api/admin/referral-sources/${id}`, body),
    onSuccess: async () => {
      setMsg("Updated.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referralSources(providerId) });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Update failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/referral-sources/${id}`),
    onSuccess: async () => {
      setMsg("Deleted.");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.referralSources(providerId) });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Delete failed"),
  });

  const providers = Array.isArray(providersQ.data) ? providersQ.data : [];
  const sources = Array.isArray(sourcesQ.data) ? sourcesQ.data : [];

  if (denied) return denied;
  if (providersQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Referral sources" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (providersQ.error) {
    if (isAdminApiAuthFailure(providersQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={providersQ.error.message} onRetry={() => void providersQ.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Referral sources"
        description="Per-provider sources used on bookings (how the client heard about the business). Scoped to the admin tenant’s providers."
      />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Provider</label>
        <select
          className="max-w-xl rounded-lg border border-gray-200 px-2 py-2 text-sm"
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setMsg(null);
          }}
        >
          <option value="">Select a provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.business_name || p.name || p.id}
            </option>
          ))}
        </select>
      </AdminPanel>

      {providerId ? (
        <>
          <AdminPanel className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Add source</h2>
            <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
              <input
                className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={createMut.isPending || !name.trim()}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Adding…" : "Add source"}
            </button>
          </AdminPanel>

          {sourcesQ.isLoading ? (
            <AdminPanel>
              <AdminPageSkeleton rows={4} />
            </AdminPanel>
          ) : sourcesQ.error ? (
            <AdminRetryBlock message={sourcesQ.error.message} onRetry={() => void sourcesQ.refetch()} />
          ) : sources.length === 0 ? (
            <EmptyState title="No referral sources for this provider" />
          ) : (
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Name</AdminTh>
                  <AdminTh>Description</AdminTh>
                  <AdminTh>Active</AdminTh>
                  <AdminTh />
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <AdminTd>
                      <input
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                        defaultValue={s.name ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== (s.name ?? "")) patchMut.mutate({ id: s.id, body: { name: v } });
                        }}
                      />
                    </AdminTd>
                    <AdminTd>
                      <input
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                        defaultValue={s.description ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (s.description ?? "")) patchMut.mutate({ id: s.id, body: { description: v || null } });
                        }}
                      />
                    </AdminTd>
                    <AdminTd>
                      <input
                        type="checkbox"
                        defaultChecked={s.is_active !== false}
                        onChange={(e) => patchMut.mutate({ id: s.id, body: { is_active: e.target.checked } })}
                      />
                    </AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        className="text-sm text-rose-700 hover:underline"
                        onClick={() => {
                          if (confirm("Delete this referral source?")) delMut.mutate(s.id);
                        }}
                      >
                        Delete
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </>
      ) : null}
    </div>
  );
}
