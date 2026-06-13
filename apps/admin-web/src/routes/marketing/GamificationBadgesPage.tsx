import { useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
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
import { adminToast } from "@/lib/adminToast";

const BADGE_REQUIREMENT_HINT =
  "Supported requirement keys: points, min_rating, min_reviews, min_bookings (non-negative numbers). Missing keys mean no minimum.";

type BadgeRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  slug?: string;
  tier?: number;
  is_active?: boolean;
  color?: string;
  icon_url?: string | null;
};

type Payload = { badges: BadgeRow[]; total: number };

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    throw new Error(`${label} must be a JSON object`);
  } catch (e) {
    throw e instanceof Error ? e : new Error(`Invalid ${label} JSON`);
  }
}

export function GamificationBadgesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const inc = sp.get("include_inactive") === "true" ? "true" : "false";
  const qk = useMemo(() => adminQueryKeys.gamificationBadges(inc), [inc]);

  const q = useQuery({
    queryKey: qk,
    queryFn: () =>
      adminApi.getJson<Payload>(`/api/admin/gamification/badges?include_inactive=${inc === "true"}`, { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data?.badges ?? [];

  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState("");
  const [nSlug, setNSlug] = useState("");
  const [nTier, setNTier] = useState("1");
  const [nColor, setNColor] = useState("#444444");
  const [nReq, setNReq] = useState("{}");
  const [nBen, setNBen] = useState("{}");
  const [nDesc, setNDesc] = useState("");
  const [nIconUrl, setNIconUrl] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eSlug, setESlug] = useState("");
  const [eTier, setETier] = useState("");
  const [eColor, setEColor] = useState("");
  const [eReq, setEReq] = useState("");
  const [eBen, setEBen] = useState("");
  const [eIconUrl, setEIconUrl] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eActive, setEActive] = useState(true);

  const invalidate = () => void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "gamification", "badges"] });

  const createBadge = useMutation({
    mutationFn: () => {
      const tier = parseInt(nTier, 10);
      if (Number.isNaN(tier) || tier < 1 || tier > 10) throw new Error("Tier must be 1–10");
      return adminApi.postJson<unknown>("/api/admin/gamification/badges", {
        name: nName.trim(),
        slug: nSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: nDesc.trim() || null,
        icon_url: nIconUrl.trim() || null,
        tier,
        color: nColor.trim(),
        requirements: parseJsonObject(nReq, "Requirements"),
        benefits: parseJsonObject(nBen, "Benefits"),
        is_active: true,
        display_order: 0,
      });
    },
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setNName("");
      setNSlug("");
      setNTier("1");
      setNColor("#444444");
      setNReq("{}");
      setNBen("{}");
      setNDesc("");
      setNIconUrl("");
      adminToast.success("Badge created");
    },
    onError: (e: Error) => adminToast.error(`Failed to create badge: ${e.message}`),
  });

  const patchBadge = useMutation({
    mutationFn: (body: { id: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson<unknown>(`/api/admin/gamification/badges/${body.id}`, body.patch),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      adminToast.success("Badge updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update badge: ${e.message}`),
  });

  const deleteBadge = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson<unknown>(`/api/admin/gamification/badges/${id}`),
    onSuccess: () => {
      invalidate();
      adminToast.success("Badge deleted");
    },
    onError: (e: Error) => adminToast.error(`Failed to delete badge: ${e.message}`),
  });

  function openEdit(row: BadgeRow) {
    if (!row.id) return;
    setEditId(row.id);
    setEName(String(row.name ?? ""));
    setESlug(String(row.slug ?? ""));
    setETier(String(row.tier ?? ""));
    setEColor(String(row.color ?? ""));
    setEIconUrl(String(row.icon_url ?? ""));
    setEDesc(String(row.description ?? ""));
    setEActive(row.is_active !== false);
    setEReq(JSON.stringify(row.requirements ?? {}, null, 2));
    setEBen(JSON.stringify(row.benefits ?? {}, null, 2));
  }

  function submitEdit() {
    if (!editId) return;
    const tier = parseInt(eTier, 10);
    if (!eName.trim() || !eSlug.trim()) return;
    if (Number.isNaN(tier) || tier < 1 || tier > 10) return;
    const patch: Record<string, unknown> = {
      name: eName.trim(),
      slug: eSlug.trim().toLowerCase().replace(/\s+/g, "-"),
      color: eColor.trim(),
      description: eDesc.trim() || null,
      icon_url: eIconUrl.trim() || null,
      is_active: eActive,
      requirements: parseJsonObject(eReq, "Requirements"),
      benefits: parseJsonObject(eBen, "Benefits"),
      tier,
    };
    patchBadge.mutate({ id: editId, patch });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Badges" />
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

  const createErr = createBadge.error instanceof Error ? createBadge.error.message : null;
  const patchErr = patchBadge.error instanceof Error ? patchBadge.error.message : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Gamification · Badges"
        description="Create and maintain provider badges. Requirements and benefits are JSON objects."
      />
      <AdminPanel>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={inc === "true"}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.checked) n.set("include_inactive", "true");
              else n.delete("include_inactive");
              setSp(n, { replace: true });
            }}
          />
          Include inactive
        </label>
        <button
          type="button"
          className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm"
          onClick={() => setCreating((c) => !c)}
        >
          {creating ? "Hide form" : "New badge"}
        </button>
      </AdminPanel>

      {creating ? (
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-600">{BADGE_REQUIREMENT_HINT}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Name
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nName} onChange={(e) => setNName(e.target.value)} />
            </label>
            <label className="text-sm">
              Slug
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nSlug} onChange={(e) => setNSlug(e.target.value)} />
            </label>
            <label className="text-sm">
              Tier (1–10)
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nTier} onChange={(e) => setNTier(e.target.value)} />
            </label>
            <label className="text-sm">
              Color
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nColor} onChange={(e) => setNColor(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Description (optional)
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nDesc} onChange={(e) => setNDesc(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Icon URL (optional)
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nIconUrl} onChange={(e) => setNIconUrl(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Requirements (JSON object)
              <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={4} value={nReq} onChange={(e) => setNReq(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Benefits (JSON object)
              <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={4} value={nBen} onChange={(e) => setNBen(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={createBadge.isPending || !nName.trim() || !nSlug.trim()}
            onClick={() => createBadge.mutate()}
          >
            Create badge
          </button>
          {createErr ? <p className="mt-2 text-sm text-red-600">{createErr}</p> : null}
        </AdminPanel>
      ) : null}

      {editId ? (
        <AdminPanel>
          <p className="mb-2 text-sm font-medium text-gray-900">Edit badge</p>
          <p className="mb-3 text-sm text-gray-600">{BADGE_REQUIREMENT_HINT}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Name
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eName} onChange={(e) => setEName(e.target.value)} />
            </label>
            <label className="text-sm">
              Slug
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eSlug} onChange={(e) => setESlug(e.target.value)} />
            </label>
            <label className="text-sm">
              Tier (1–10)
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eTier} onChange={(e) => setETier(e.target.value)} />
            </label>
            <label className="text-sm">
              Color
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eColor} onChange={(e) => setEColor(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Icon URL
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eIconUrl} onChange={(e) => setEIconUrl(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
              Active
            </label>
            <label className="text-sm sm:col-span-2">
              Requirements
              <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={4} value={eReq} onChange={(e) => setEReq(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Benefits
              <textarea className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={4} value={eBen} onChange={(e) => setEBen(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={
                patchBadge.isPending ||
                !eName.trim() ||
                !eSlug.trim() ||
                Number.isNaN(parseInt(eTier, 10)) ||
                parseInt(eTier, 10) < 1 ||
                parseInt(eTier, 10) > 10
              }
              onClick={() => submitEdit()}
            >
              Save
            </button>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setEditId(null)}>
              Cancel
            </button>
          </div>
          {patchErr ? <p className="mt-2 text-sm text-red-600">{patchErr}</p> : null}
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No badges" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Tier</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Icon</AdminTh>
              <AdminTh className="min-w-[12rem]">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              return (
                <tr key={id || String(r.slug)}>
                  <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                  <AdminTd className="font-mono text-xs">{String(r.slug ?? "")}</AdminTd>
                  <AdminTd>{String(r.tier ?? "")}</AdminTd>
                  <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
                  <AdminTd className="max-w-[12rem] truncate text-xs text-gray-500">{String(r.icon_url ?? "—")}</AdminTd>
                  <AdminTd className="space-x-2 text-sm">
                    <button type="button" className="text-gray-900 underline" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-gray-900 underline disabled:opacity-50"
                      disabled={patchBadge.isPending || !r.id}
                      onClick={() => r.id && patchBadge.mutate({ id: r.id, patch: { is_active: !r.is_active } })}
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="text-red-700 underline disabled:opacity-50"
                      disabled={deleteBadge.isPending || !r.id}
                      onClick={() => {
                        if (r.id && window.confirm("Delete this badge? (Fails if assigned to a provider.)")) {
                          deleteBadge.mutate(r.id);
                        }
                      }}
                    >
                      Delete
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
