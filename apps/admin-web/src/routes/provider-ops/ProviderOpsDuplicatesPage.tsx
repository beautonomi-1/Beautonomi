import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
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
import { cn } from "@/lib/cn";

type Reason =
  | "already_provider"
  | "already_user"
  | "internal_duplicate"
  | "matched_provider_and_duplicate";

interface DupLead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string;
  source: string;
  created_at: string;
  matched_provider_id: string | null;
  updated_at?: string;
}

interface ExistingProvider {
  id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
}

interface ExistingUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface DuplicateGroup {
  key: string;
  key_type: "email" | "phone";
  key_display: string;
  reason: Reason;
  lead_count: number;
  leads: DupLead[];
  existing_provider: ExistingProvider | null;
  existing_user: ExistingUser | null;
  recommended_delete_ids: string[];
}

interface DuplicatesResponse {
  total_groups: number;
  total_duplicate_leads: number;
  scanned_leads: number;
  scan_capped: boolean;
  groups: DuplicateGroup[];
}

const REASON_META: Record<
  Reason,
  { label: string; tone: "emerald" | "amber" | "violet" | "rose"; hint: string }
> = {
  already_provider: {
    label: "Already a provider",
    tone: "rose",
    hint: "This contact is already an onboarded provider — the lead row is clutter.",
  },
  already_user: {
    label: "Already registered",
    tone: "amber",
    hint: "This person already has a user account in the tenant.",
  },
  internal_duplicate: {
    label: "Duplicate lead",
    tone: "violet",
    hint: "Multiple inbox leads share this contact — keep one, delete the rest.",
  },
  matched_provider_and_duplicate: {
    label: "Duplicate + already a provider",
    tone: "rose",
    hint: "Several leads share this contact and it's already an onboarded provider.",
  },
};

const TONE_CLASSES: Record<
  "emerald" | "amber" | "violet" | "rose",
  { chip: string; border: string; bg: string }
> = {
  emerald: { chip: "bg-emerald-100 text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50" },
  amber: { chip: "bg-amber-100 text-amber-700", border: "border-amber-200", bg: "bg-amber-50" },
  violet: { chip: "bg-violet-100 text-violet-700", border: "border-violet-200", bg: "bg-violet-50" },
  rose: { chip: "bg-rose-100 text-rose-700", border: "border-rose-200", bg: "bg-rose-50" },
};

export function ProviderOpsDuplicatesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDER_OPS,
    "Provider Ops access is required.",
  );
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<"all" | Reason>("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.duplicates(),
    queryFn: () =>
      adminApi.getJson<DuplicatesResponse>("/api/admin/provider-ops/duplicates", {
        timeoutMs: 60_000,
      }),
    enabled: allowed,
  });

  const data = q.data;
  const groups = data?.groups ?? [];

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (reasonFilter !== "all" && g.reason !== reasonFilter) return false;
      if (!searchQuery.trim()) return true;
      const needle = searchQuery.toLowerCase();
      if (g.key_display.toLowerCase().includes(needle)) return true;
      for (const l of g.leads) {
        if (
          (l.business_name ?? "").toLowerCase().includes(needle) ||
          (l.contact_person_name ?? "").toLowerCase().includes(needle) ||
          (l.email ?? "").toLowerCase().includes(needle) ||
          (l.phone_e164 ?? "").includes(needle)
        ) {
          return true;
        }
      }
      if (
        g.existing_provider?.business_name?.toLowerCase().includes(needle) ||
        g.existing_provider?.email?.toLowerCase().includes(needle) ||
        g.existing_provider?.phone?.toLowerCase().includes(needle)
      ) {
        return true;
      }
      return false;
    });
  }, [groups, reasonFilter, searchQuery]);

  const reasonCounts = useMemo(() => {
    const c: Record<Reason | "all", number> = {
      all: groups.length,
      already_provider: 0,
      already_user: 0,
      internal_duplicate: 0,
      matched_provider_and_duplicate: 0,
    };
    for (const g of groups) c[g.reason]++;
    return c;
  }, [groups]);

  const visibleLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of filtered) for (const l of g.leads) s.add(l.id);
    return s;
  }, [filtered]);

  const selectedLeadsInView = useMemo(() => {
    const ids: string[] = [];
    for (const id of selectedLeadIds) if (visibleLeadIds.has(id)) ids.push(id);
    return ids;
  }, [selectedLeadIds, visibleLeadIds]);

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      adminApi.postJson<{ deleted: number; skipped_matched: string[]; not_found: string[] }>(
        "/api/admin/provider-ops/leads/bulk-delete",
        { ids },
      ),
    onSuccess: (res) => {
      setConfirmOpen(false);
      setSelectedLeadIds(new Set());
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      if (res.deleted > 0) {
        adminToast.success(
          `Deleted ${res.deleted} duplicate lead${res.deleted === 1 ? "" : "s"}`,
        );
      } else {
        adminToast.info("No leads deleted");
      }
      if (res.skipped_matched.length > 0) {
        adminToast.warning(
          `${res.skipped_matched.length} matched lead${res.skipped_matched.length === 1 ? "" : "s"} skipped — unlink first to delete`,
        );
      }
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      adminToast.error(err.message || "Bulk delete failed");
    },
  });

  const confirmMatchMut = useMutation({
    mutationFn: async ({
      leadId,
      providerId,
      expected_updated_at,
    }: {
      leadId: string;
      providerId: string;
      expected_updated_at?: string;
    }) => {
      await adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, {
        activity_type: "match_confirmed",
        description: `Confirmed match to provider ${providerId}`,
        metadata: { matched_provider_id: providerId, match_type: "manual" },
      });
      await adminApi.patchJson(`/api/admin/provider-ops/leads/${leadId}/stage`, {
        stage: "matched",
        matched_provider_id: providerId,
        match_confidence: 0.95,
        ...(expected_updated_at ? { expected_updated_at } : {}),
      });
    },
    onSuccess: () => {
      adminToast.success("Lead linked to provider");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to link lead"),
  });

  function toggleLeadSelected(id: string) {
    setSelectedLeadIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleGroupSelected(g: DuplicateGroup, mode: "all" | "recommended" | "none") {
    setSelectedLeadIds((prev) => {
      const n = new Set(prev);
      if (mode === "none") {
        for (const l of g.leads) n.delete(l.id);
      } else if (mode === "all") {
        for (const l of g.leads) n.add(l.id);
      } else {
        for (const id of g.recommended_delete_ids) n.add(id);
      }
      return n;
    });
  }

  function selectRecommendedAcrossVisible() {
    setSelectedLeadIds((prev) => {
      const n = new Set(prev);
      for (const g of filtered) {
        for (const id of g.recommended_delete_ids) n.add(id);
      }
      return n;
    });
  }

  function clearSelection() {
    setSelectedLeadIds(new Set());
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Duplicate Leads" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const totalSelected = selectedLeadsInView.length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Duplicate Leads"
        description={
          data
            ? `${data.total_groups.toLocaleString()} duplicate group${data.total_groups === 1 ? "" : "s"} · ${data.total_duplicate_leads.toLocaleString()} removable lead${data.total_duplicate_leads === 1 ? "" : "s"}`
            : "Merge or delete duplicate leads across the inbox"
        }
      />

      {data?.scan_capped && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Only the {data.scanned_leads.toLocaleString()} most recent unmatched leads were scanned.
          Clean up this batch and refresh to scan the next one.
        </div>
      )}

      {/* Filter + search toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="search"
            placeholder="Search email, phone, business, provider…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", `All (${reasonCounts.all})`],
              ["already_provider", `Provider match (${reasonCounts.already_provider})`],
              ["matched_provider_and_duplicate", `Provider + duplicate (${reasonCounts.matched_provider_and_duplicate})`],
              ["internal_duplicate", `Inbox duplicate (${reasonCounts.internal_duplicate})`],
              ["already_user", `User match (${reasonCounts.already_user})`],
            ] as const
          )
            .filter(([r]) => r === "all" || reasonCounts[r] > 0)
            .map(([r, label]) => (
              <button
                key={r}
                type="button"
                onClick={() => setReasonFilter(r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  reasonFilter === r
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {/* Bulk select bar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={selectRecommendedAcrossVisible}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Select recommended ({filtered.reduce((s, g) => s + g.recommended_delete_ids.length, 0)})
            </button>
            {totalSelected > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">
              {totalSelected.toLocaleString()} selected
            </span>
            <button
              type="button"
              disabled={totalSelected === 0 || bulkDeleteMut.isPending}
              onClick={() => setConfirmOpen(true)}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={groups.length === 0 ? "No duplicates detected" : "No duplicates match this filter"}
          description={
            groups.length === 0
              ? "We cross-checked every unmatched lead against providers, provider owners, and other leads using email and phone. Nothing to clean up yet."
              : "Try clearing the search or picking a different category."
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              selectedIds={selectedLeadIds}
              onToggleLead={toggleLeadSelected}
              onToggleGroup={toggleGroupSelected}
              onConfirmMatch={(leadId, providerId, expectedUpdatedAt) =>
                confirmMatchMut.mutate({ leadId, providerId, expected_updated_at: expectedUpdatedAt })
              }
              confirming={confirmMatchMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">
              Delete {totalSelected.toLocaleString()} lead{totalSelected === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              This permanently removes the selected lead rows and their activities, tasks,
              and categories. Leads already linked to a provider will be skipped — unlink
              them first if you need to delete those.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkDeleteMut.isPending}
                onClick={() => bulkDeleteMut.mutate(selectedLeadsInView)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {bulkDeleteMut.isPending ? "Deleting…" : "Delete leads"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  selectedIds,
  onToggleLead,
  onToggleGroup,
  onConfirmMatch,
  confirming,
}: {
  group: DuplicateGroup;
  selectedIds: Set<string>;
  onToggleLead: (id: string) => void;
  onToggleGroup: (g: DuplicateGroup, mode: "all" | "recommended" | "none") => void;
  onConfirmMatch: (leadId: string, providerId: string, expectedUpdatedAt?: string) => void;
  confirming: boolean;
}) {
  const reason = REASON_META[group.reason];
  const tone = TONE_CLASSES[reason.tone];

  const allSelected = group.leads.every((l) => selectedIds.has(l.id));
  const someSelected = !allSelected && group.leads.some((l) => selectedIds.has(l.id));

  return (
    <AdminPanel className={cn("!p-0 overflow-hidden", tone.border)}>
      {/* Group header */}
      <div className={cn("flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between", tone.bg)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tone.chip)}>
              {reason.label}
            </span>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {group.key_type === "email" ? "Email" : "Phone"}
            </span>
            <span className="text-sm font-medium text-gray-800 truncate">{group.key_display}</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">{reason.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.recommended_delete_ids.length > 0 && (
            <button
              type="button"
              onClick={() => onToggleGroup(group, "recommended")}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              title="Select the leads we believe are safe to delete"
            >
              Select recommended ({group.recommended_delete_ids.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleGroup(group, allSelected ? "none" : "all")}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {allSelected ? "Deselect all" : someSelected ? "Select rest" : "Select all"}
          </button>
        </div>
      </div>

      {/* Existing provider/user banner */}
      {(group.existing_provider || group.existing_user) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm">
          <div className="min-w-0">
            {group.existing_provider ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Existing provider
                </span>
                <span className="font-medium text-gray-800 truncate">
                  {group.existing_provider.business_name || "Unnamed provider"}
                </span>
                {group.existing_provider.status && (
                  <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
                    {group.existing_provider.status}
                  </span>
                )}
                <span className="truncate text-xs text-gray-500">
                  {group.existing_provider.email || group.existing_provider.phone || ""}
                </span>
              </div>
            ) : group.existing_user ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Existing user
                </span>
                <span className="font-medium text-gray-800 truncate">
                  {group.existing_user.full_name || "Unnamed"}
                </span>
                <span className="truncate text-xs text-gray-500">
                  {group.existing_user.email || group.existing_user.phone || ""}
                </span>
              </div>
            ) : null}
          </div>
          {group.existing_provider && (
            <Link
              to={adminSpaTo(`/admin/providers/${group.existing_provider.id}`)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Open provider
            </Link>
          )}
        </div>
      )}

      {/* Lead rows */}
      <ul className="divide-y divide-gray-100">
        {group.leads.map((lead, idx) => {
          const isNewest = idx === 0;
          const selected = selectedIds.has(lead.id);
          const recommended = group.recommended_delete_ids.includes(lead.id);
          return (
            <li
              key={lead.id}
              className={cn(
                "flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
                selected && "bg-rose-50/40",
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <label className="mt-1 inline-flex touch-manipulation items-center">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleLead(lead.id)}
                    className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                  />
                </label>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-gray-800">
                      {lead.business_name || lead.contact_person_name || "Unnamed lead"}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500">
                      {lead.commercial_stage.replace(/_/g, " ")}
                    </span>
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      {lead.source}
                    </span>
                    {isNewest && group.reason === "internal_duplicate" && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        Newest · will be kept
                      </span>
                    )}
                    {recommended && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                        Safe to delete
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {lead.email && <span className="truncate">{lead.email}</span>}
                    {lead.phone_e164 && <span>{lead.phone_e164}</span>}
                    <span>Created {new Date(lead.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open lead
                </Link>
                {group.existing_provider && (
                  <button
                    type="button"
                    disabled={confirming}
                    onClick={() =>
                      onConfirmMatch(lead.id, group.existing_provider!.id, lead.updated_at)
                    }
                    className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    title="Link this lead to the existing provider (keeps attribution)"
                  >
                    Link to provider
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </AdminPanel>
  );
}
