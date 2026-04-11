import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

interface DuplicateMatch { type: "provider" | "user" | "lead"; id: string; name: string | null; email: string | null; phone: string | null; matched_on: string[]; confidence: number }
interface PossibleDuplicate { lead: { id: string; business_name: string | null; email: string | null; phone_e164: string | null; commercial_stage: string; source: string }; matches: DuplicateMatch[] }

export function ProviderOpsDuplicatesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.duplicates(),
    queryFn: () => adminApi.getJson<{ data: PossibleDuplicate[] }>("/api/admin/provider-ops/duplicates", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const duplicates = q.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return duplicates;
    const lo = searchQuery.toLowerCase();
    return duplicates.filter((d) => {
      const ln = d.lead.business_name?.toLowerCase() || "";
      const le = d.lead.email?.toLowerCase() || "";
      const lp = d.lead.phone_e164 || "";
      return ln.includes(lo) || le.includes(lo) || lp.includes(lo);
    });
  }, [duplicates, searchQuery]);

  async function handleConfirmMatch(leadId: string, matchType: string, matchId: string) {
    try {
      if (matchType === "provider") {
        await adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, { activity_type: "match_confirmed", description: `Confirmed match to provider ${matchId}`, metadata: { matched_provider_id: matchId, match_type: "manual" } });
        await adminApi.patchJson(`/api/admin/provider-ops/leads/${leadId}/stage`, { stage: "matched" });
      }
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.duplicates() });
    } catch { /* silent */ }
  }

  async function handleDismiss(leadId: string, matchId: string) {
    try {
      await adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, { activity_type: "match_rejected", description: `Dismissed possible match ${matchId}`, metadata: { dismissed_match_id: matchId } });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.duplicates() });
    } catch { /* silent */ }
  }

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Duplicate Review" /><AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Duplicate Review" description={`${filtered.length} possible duplicate(s) found`} />

      <input type="text" placeholder="Search by name, email, or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full max-w-sm rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder:text-gray-400" />

      {filtered.length === 0 ? <EmptyState title="No duplicates detected" /> : (
        <div className="space-y-4">
          {filtered.map((dup) => (
            <AdminPanel key={dup.lead.id}>
              <div className="mb-3 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">Lead: {dup.lead.business_name || "Unnamed"}</span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600">{dup.lead.commercial_stage}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{dup.lead.source}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {dup.lead.email && <span className="truncate">{dup.lead.email}</span>}
                    {dup.lead.phone_e164 && <span>{dup.lead.phone_e164}</span>}
                  </div>
                </div>
                <Link to={adminSpaTo(`/admin/provider-ops/leads/${dup.lead.id}`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">View Lead</Link>
              </div>

              <div className="divide-y">
                {dup.matches.map((m) => (
                  <div key={`${m.type}-${m.id}`} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.type === "provider" ? "bg-green-100 text-green-700" : m.type === "user" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>{m.type}</span>
                        <span className="text-sm font-medium text-gray-800">{m.name || "Unnamed"}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${m.confidence >= 0.9 ? "border-green-300 text-green-700" : m.confidence >= 0.7 ? "border-amber-300 text-amber-700" : "border-gray-300 text-gray-600"}`}>{Math.round(m.confidence * 100)}% confident</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {m.email && <span className="truncate">{m.email}</span>}
                        {m.phone && <span>{m.phone}</span>}
                        <span className="text-gray-400">Matched on: {m.matched_on.join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleDismiss(dup.lead.id, m.id)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Dismiss</button>
                      {m.type === "provider" && <button type="button" onClick={() => handleConfirmMatch(dup.lead.id, m.type, m.id)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">Confirm</button>}
                    </div>
                  </div>
                ))}
              </div>
            </AdminPanel>
          ))}
        </div>
      )}
    </div>
  );
}
