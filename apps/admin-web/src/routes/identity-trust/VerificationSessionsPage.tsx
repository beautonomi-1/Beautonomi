/**
 * Identity & Trust → Verification Sessions
 *
 * Didit identity-verification session ops console with filter, search, and manual actions.
 * Permission-gated to superadmin. All manual actions are audited.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";

type SessionRow = {
  id: string;
  persona_type: "customer" | "provider";
  session_kind?: "user" | "business";
  provider: string;
  provider_session_id: string | null;
  status: string;
  name_mismatch_flag: boolean;
  identity_dedupe_flag: boolean;
  under_age_flag: boolean;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  provider_id: string | null;
  tenant_id: string | null;
  user_email?: string;
  user_name?: string;
};

type PaginatedSessions = {
  items: SessionRow[];
  total: number;
  page: number;
  per_page: number;
};

const STATUS_COLORS: Record<string, string> = {
  approved:       "bg-green-100 text-green-800",
  rejected:       "bg-red-100 text-red-800",
  pending_review: "bg-blue-100 text-blue-800",
  in_progress:    "bg-yellow-100 text-yellow-800",
  expired:        "bg-gray-100 text-gray-600",
  abandoned:      "bg-gray-100 text-gray-600",
  not_started:    "bg-gray-50 text-gray-500",
  session_created:"bg-gray-50 text-gray-500",
  errored:        "bg-red-50 text-red-600",
};

export function VerificationSessionsPage() {
  const { allowed, denied } = useSuperadminPage("Identity & Trust is superadmin-only.");
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: initialStatus,
    persona: "",
    sessionKind: "",
    flags: "",
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, filter, search, page]);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#verification") return;
    const timer = window.setTimeout(() => {
      document.getElementById("verification")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loading, filter.status]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: "25",
        ...(filter.status   ? { status:  filter.status }  : {}),
        ...(filter.persona  ? { persona: filter.persona } : {}),
        ...(filter.sessionKind ? { session_kind: filter.sessionKind } : {}),
        ...(filter.flags === "needs_review"
          ? { has_flags: "true" }
          : filter.flags === "mismatch"
            ? { name_mismatch: "true" }
            : {}),
        ...(search ? { q: search } : {}),
      });
      const res = await adminApi.getJson<PaginatedSessions>(`/api/admin/identity-verification/sessions?${params}`);
      setSessions((res as PaginatedSessions | null)?.items ?? []);
      setTotal((res as PaginatedSessions | null)?.total ?? 0);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  async function doAction(sessionId: string, action: string, body?: Record<string, unknown>) {
    setActionLoading(`${sessionId}:${action}`);
    setMsg(null);
    try {
      await adminApi.postJson(`/api/admin/identity-verification/sessions/${sessionId}/${action}`, body ?? {});
      setMsg(`Action '${action}' completed`);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `Action '${action}' failed`);
    } finally {
      setActionLoading(null);
    }
  }

  if (denied) return null;

  return (
    <div className="space-y-6">
      <div id="verification" className="scroll-mt-24">
        <AdminPageHeader
          title="Verification Sessions"
          description="Didit identity-verification sessions. Open the Didit Business Console for credits and org settings."
        />
        <p className="mt-2 text-sm text-gray-600">
          Platform: <span className="font-medium text-gray-900">Didit</span>
          {" · "}
          <a
            href="https://business.didit.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            business.didit.me
          </a>
        </p>
      </div>

      {msg && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800 flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg(null)} className="text-blue-600 underline ml-2">dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search user, provider, session id…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="rounded-md border border-input px-3 py-1.5 text-sm w-64"
        />
        <select
          value={filter.status}
          onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {["not_started","session_created","in_progress","pending_review","approved","rejected","expired","abandoned","errored"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filter.persona}
          onChange={e => { setFilter(f => ({ ...f, persona: e.target.value })); setPage(1); }}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">All personas</option>
          <option value="customer">Customer</option>
          <option value="provider">Provider</option>
        </select>
        <select
          value={filter.sessionKind}
          onChange={e => { setFilter(f => ({ ...f, sessionKind: e.target.value })); setPage(1); }}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">All session types</option>
          <option value="user">Person (KYC)</option>
          <option value="business">Business (KYB)</option>
        </select>
        <select
          onChange={e => { setFilter(f => ({ ...f, flags: e.target.value })); setPage(1); }}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
        >
          <option value="">All flags</option>
          <option value="needs_review">Has review flags</option>
          <option value="mismatch">Name mismatch</option>
        </select>
      </div>

      <AdminPanel>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-900">Sessions ({total})</h3>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No sessions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">User / Provider</th>
                  <th className="pb-2 pr-4">Persona</th>
                  <th className="pb-2 pr-4">Vendor</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Flags</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-mono text-xs text-muted-foreground">{s.user_email ?? s.user_id.slice(0, 8) + "…"}</div>
                      {s.user_name && (
                        <div className="text-xs text-gray-700 mt-0.5">{s.user_name}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="capitalize">{s.persona_type}</span>
                      {s.session_kind === "business" && (
                        <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-800">
                          KYB
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-xs">{s.provider}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-50 text-gray-600"}`}>
                        {s.status}
                      </span>
                      {s.rejection_reason && (
                        <div className="text-xs text-red-600 mt-0.5">{s.rejection_reason}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {s.name_mismatch_flag && <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px]">name mismatch</span>}
                        {s.identity_dedupe_flag && <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px]">dedupe</span>}
                        {s.under_age_flag && <span className="rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 text-[10px]">under age</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {["approved","rejected","in_progress"].includes(s.status) || (
                          <button
                            onClick={() => void doAction(s.id, "override", { status: "approved", reason: "Admin manual override" })}
                            disabled={actionLoading !== null}
                            className="text-xs rounded px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => void doAction(s.id, "resend")}
                          disabled={actionLoading !== null}
                          className="text-xs rounded px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          Resend
                        </button>
                        <button
                          onClick={() => void doAction(s.id, "reprocess-webhook")}
                          disabled={actionLoading !== null}
                          className="text-xs rounded px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          Reprocess
                        </button>
                        {(s.name_mismatch_flag || s.identity_dedupe_flag || s.under_age_flag) && (
                          <button
                            onClick={() => void doAction(s.id, "resolve-flag", { flag: "all", rationale: "Admin reviewed" })}
                            disabled={actionLoading !== null}
                            className="text-xs rounded px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Resolve flags
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            {sessions.length > 0 ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}` : "No results"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded px-3 py-1.5 text-xs border disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 25 >= total}
              className="rounded px-3 py-1.5 text-xs border disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}
