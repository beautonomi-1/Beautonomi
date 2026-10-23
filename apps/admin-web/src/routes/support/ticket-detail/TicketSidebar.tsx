import { Link } from "react-router";
import { Copy, ExternalLink } from "lucide-react";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { SUPPORT_TICKET_CATEGORY_GROUPS } from "@/lib/supportTicketCategories";
import {
  adminSupportContextActionLabel,
  adminSupportContextHrefForRole,
} from "@/lib/adminSupportContextHref";
import type { UserRole } from "@beautonomi/types";
import {
  STATUSES,
  PRIORITIES,
  formatDateTime,
  isSlaBreached,
  str,
  type TicketRow,
} from "@/routes/support/ticket-detail/ticketDetailHelpers";

type Assignee = { id: string; email: string | null; full_name: string | null; role: string };

type ContextRecord = { kind: string; id: string; label: string; status: string | null; at: string | null };

type TicketSidebarProps = {
  ticket: TicketRow;
  assignees: Assignee[];
  assignedId: string;
  assigneeInList: boolean;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  slaDueInput: string;
  setSlaDueInput: (v: string) => void;
  patchPending: boolean;
  assigneesLoading: boolean;
  onPatch: (body: {
    status?: string;
    priority?: string;
    assigned_to?: string | null;
    category?: string | null;
    tags?: string[];
    sla_resolution_due_at?: string | null;
  }) => void;
  onTagsBlur: () => void;
  onSlaBlur: () => void;
  viewerRole: UserRole;
  canProviderOps: boolean;
  canUsersTrust: boolean;
  contextFacts: Record<string, string | number | boolean | null> | null | undefined;
  contextRecords: ContextRecord[];
  contextAttachSearch: string;
  setContextAttachSearch: (v: string) => void;
  contextRecordsFetching: boolean;
  attachBookingNumber: string;
  setAttachBookingNumber: (v: string) => void;
  attachOrderNumber: string;
  setAttachOrderNumber: (v: string) => void;
  attachGiftCode: string;
  setAttachGiftCode: (v: string) => void;
  attachContextPending: boolean;
  onAttachPick: (pick: { kind: string; id: string }) => void;
  onAttachManual: () => void;
  bookingContextId: string | null;
  contextBooking: {
    id: string;
    status: string;
    currency: string;
    total_refunded?: number | null;
  } | null | undefined;
  showRefundAction: boolean;
  onCancelBooking: () => void;
  onRefundBooking: () => void;
};

export function TicketSidebar({
  ticket,
  assignees,
  assignedId,
  assigneeInList,
  tagsInput,
  setTagsInput,
  slaDueInput,
  setSlaDueInput,
  patchPending,
  assigneesLoading,
  onPatch,
  onTagsBlur,
  onSlaBlur,
  viewerRole,
  canProviderOps,
  canUsersTrust,
  contextFacts,
  contextRecords,
  contextAttachSearch,
  setContextAttachSearch,
  contextRecordsFetching,
  attachBookingNumber,
  setAttachBookingNumber,
  attachOrderNumber,
  setAttachOrderNumber,
  attachGiftCode,
  setAttachGiftCode,
  attachContextPending,
  onAttachPick,
  onAttachManual,
  bookingContextId,
  contextBooking,
  showRefundAction,
  onCancelBooking,
  onRefundBooking,
}: TicketSidebarProps) {
  const hasLinkedContext = Boolean(ticket.support_context_id);
  const requesterName =
    ticket.user?.full_name || ticket.user?.email || ticket.provider?.business_name || "Unknown";
  const requesterType =
    ticket.user?.role || str(ticket.requester_type) || (ticket.provider_id ? "provider" : "customer");

  const copyIds = () => {
    const parts: string[] = [];
    if (ticket.user?.id || ticket.user_id) parts.push(`User: ${ticket.user?.id || ticket.user_id}`);
    if (ticket.provider?.id || ticket.provider_id) parts.push(`Provider: ${ticket.provider?.id || ticket.provider_id}`);
    if (ticket.support_context_id) parts.push(`Context: ${ticket.support_context_id}`);
    if (!parts.length) {
      adminToast.error("Nothing to copy");
      return;
    }
    void navigator.clipboard?.writeText(parts.join("\n")).then(
      () => adminToast.success("IDs copied"),
      () => adminToast.error("Could not copy"),
    );
  };

  const contextHref = adminSupportContextHrefForRole(
    viewerRole,
    ticket.support_context_type,
    ticket.support_context_id,
  );

  return (
    <aside className="min-h-0 space-y-3 overflow-y-auto lg:max-h-full">
      <AdminPanel className="!p-3 md:!p-4">
        <h2 className="text-sm font-semibold text-gray-900">Routing</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Status</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={str(ticket.status)}
              disabled={patchPending}
              onChange={(e) => onPatch({ status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Priority</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={str(ticket.priority)}
              disabled={patchPending}
              onChange={(e) => onPatch({ priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Assignee</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={assignedId}
              disabled={patchPending || assigneesLoading}
              onChange={(e) => {
                const v = e.target.value;
                onPatch({ assigned_to: v === "" ? null : v });
              }}
            >
              <option value="">Unassigned</option>
              {!assigneeInList && assignedId ? (
                <option value={assignedId}>
                  {ticket.assigned_user?.full_name || ticket.assigned_user?.email || assignedId} (current)
                </option>
              ) : null}
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email || a.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Category</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={ticket.category ?? ""}
              disabled={patchPending}
              onChange={(e) => {
                const v = e.target.value;
                onPatch({ category: v === "" ? null : v });
              }}
            >
              <option value="">Uncategorized</option>
              {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tags (comma-separated)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onBlur={onTagsBlur}
              placeholder="billing, vip, follow-up"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">SLA resolution due</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={slaDueInput}
              disabled={patchPending}
              onChange={(e) => setSlaDueInput(e.target.value)}
              onBlur={onSlaBlur}
            />
            <p className="mt-1 text-xs text-gray-500">Clear the field and blur to remove the SLA deadline.</p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="!p-3 md:!p-4">
        <h2 className="text-sm font-semibold text-gray-900">People &amp; context</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Requester</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{requesterName}</dd>
            <dd className="break-all text-gray-700">{ticket.user?.email || ticket.requester_email || "—"}</dd>
            <dd className="text-gray-700">{ticket.user?.phone || "—"}</dd>
            <dd className="capitalize text-gray-600">{requesterType}</dd>
            <dd className={ticket.user?.is_active === false ? "font-medium text-red-700" : "text-gray-600"}>
              {ticket.user?.is_active === false ? "Inactive account" : ticket.user?.is_active === true ? "Active account" : ""}
            </dd>
            {ticket.user?.created_at ? (
              <dd className="text-xs text-gray-500">Joined {formatDateTime(ticket.user.created_at)}</dd>
            ) : null}
            {ticket.user?.id ? (
              <Link
                className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gray-900 underline"
                to={adminSpaTo(`/admin/users/${ticket.user.id}`)}
              >
                View user profile
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {ticket.provider?.id || ticket.provider_id ? (
            <div className="border-t border-gray-100 pt-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Provider</dt>
              <dd className="mt-0.5 font-semibold text-gray-900">
                {ticket.provider?.business_name || ticket.provider_id}
              </dd>
              <dd className="break-all text-gray-700">{ticket.provider?.email || "—"}</dd>
              <dd className="text-gray-700">{ticket.provider?.phone || "—"}</dd>
              <dd className="capitalize text-gray-600">{ticket.provider?.status || "—"}</dd>
              {ticket.provider?.created_at ? (
                <dd className="text-xs text-gray-500">Created {formatDateTime(ticket.provider.created_at)}</dd>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {ticket.provider?.id && canProviderOps ? (
                  <Link
                    className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gray-900 underline"
                    to={adminSpaTo(`/admin/providers/${ticket.provider.id}`)}
                  >
                    View provider
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
                {ticket.provider?.user_id && canUsersTrust ? (
                  <Link
                    className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gray-800 underline"
                    to={adminSpaTo(`/admin/users/${ticket.provider.user_id}`)}
                  >
                    View provider owner
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="border-t border-gray-100 pt-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Support context</dt>
            <dd className="text-gray-800">
              {ticket.support_context_type
                ? `${str(ticket.support_context_type).replace(/_/g, " ")}${ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}`
                : "—"}
            </dd>
            {ticket.support_context_type && !ticket.support_context_id ? (
              <dd className="mt-1 text-xs text-amber-800">Not linked to a live record</dd>
            ) : null}
            {contextFacts ? (
              <dd className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-800">
                <p className="mb-1 font-medium text-gray-600">Verified facts</p>
                <dl className="grid gap-1 sm:grid-cols-2">
                  {Object.entries(contextFacts).map(([key, val]) => (
                    <div key={key}>
                      <dt className="text-gray-500">{key.replace(/_/g, " ")}</dt>
                      <dd className="font-medium">{val == null ? "—" : String(val)}</dd>
                    </div>
                  ))}
                </dl>
              </dd>
            ) : null}

            <details className="mt-3 rounded-lg border border-dashed border-gray-200 bg-white p-2" open={!hasLinkedContext}>
              <summary className="cursor-pointer text-xs font-medium text-gray-700">Attach record (requester-owned)</summary>
              <div className="mt-2 space-y-2">
                <input
                  type="search"
                  value={contextAttachSearch}
                  onChange={(e) => setContextAttachSearch(e.target.value)}
                  placeholder="Search booking or order…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                {contextRecordsFetching ? (
                  <p className="text-xs text-gray-500">Searching…</p>
                ) : contextRecords.length > 0 ? (
                  <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs">
                    {contextRecords.map((row) => (
                      <li key={`${row.kind}-${row.id}`}>
                        <button
                          type="button"
                          disabled={attachContextPending}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white disabled:opacity-50"
                          onClick={() => onAttachPick({ kind: row.kind, id: row.id })}
                        >
                          <span className="font-medium text-gray-900">
                            {row.kind === "product_order" ? "Order" : "Booking"} · {row.label}
                          </span>
                          <span className="shrink-0 text-gray-500">{row.status ?? "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">
                    {contextAttachSearch.trim()
                      ? "No matching bookings or orders."
                      : "No recent bookings or orders."}
                  </p>
                )}
                <input
                  type="text"
                  value={attachBookingNumber}
                  onChange={(e) => setAttachBookingNumber(e.target.value)}
                  placeholder="Booking number"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={attachOrderNumber}
                  onChange={(e) => setAttachOrderNumber(e.target.value)}
                  placeholder="Order number"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={attachGiftCode}
                  onChange={(e) => setAttachGiftCode(e.target.value)}
                  placeholder="Gift card code"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={attachContextPending}
                  onClick={onAttachManual}
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {attachContextPending ? "Searching…" : "Attach to ticket"}
                </button>
              </div>
            </details>

            <div className="mt-2 flex flex-wrap gap-2">
              {contextHref ? (
                <Link
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
                  to={adminSpaTo(contextHref)}
                >
                  {adminSupportContextActionLabel(ticket.support_context_type)}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {bookingContextId && contextBooking && canProviderOps ? (
                <>
                  {contextBooking.status !== "cancelled" && contextBooking.status !== "completed" ? (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-800 hover:bg-red-100"
                      onClick={onCancelBooking}
                    >
                      Cancel booking
                    </button>
                  ) : null}
                  {showRefundAction ? (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
                      onClick={onRefundBooking}
                    >
                      Issue refund
                    </button>
                  ) : null}
                </>
              ) : null}
              {ticket.support_context_label ? (
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    void navigator.clipboard?.writeText(str(ticket.support_context_label)).then(
                      () => adminToast.success("Reference copied"),
                      () => adminToast.error("Could not copy reference"),
                    );
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy reference
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={copyIds}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy IDs
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 text-xs text-gray-600">
            <div>
              <span className="text-gray-500">Created </span>
              {ticket.created_at ? new Date(String(ticket.created_at)).toLocaleString() : "—"}
            </div>
            <div className="mt-1">
              <span className="text-gray-500">SLA due </span>
              <span className={isSlaBreached(ticket) ? "font-medium text-red-700" : ""}>
                {ticket.sla_resolution_due_at
                  ? `${new Date(String(ticket.sla_resolution_due_at)).toLocaleString()}${isSlaBreached(ticket) ? " (overdue)" : ""}`
                  : "—"}
              </span>
            </div>
            <div className="mt-1">
              <span className="text-gray-500">First staff reply </span>
              {ticket.first_staff_reply_at ? new Date(String(ticket.first_staff_reply_at)).toLocaleString() : "—"}
            </div>
            <div className="mt-1">
              <span className="text-gray-500">Last customer reply </span>
              {ticket.last_customer_reply_at ? new Date(String(ticket.last_customer_reply_at)).toLocaleString() : "—"}
            </div>
          </div>
        </dl>
      </AdminPanel>

      <AdminPanel className="!p-3 md:!p-4">
        <h2 className="text-sm font-semibold text-gray-900">Satisfaction (CSAT)</h2>
        <p className="mt-1 text-xs text-gray-500">Read-only — submitted by the requester after resolution.</p>
        <div className="mt-3">
          {typeof ticket.csat_score === "number" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xl font-bold tabular-nums ${
                    ticket.csat_score >= 4
                      ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                      : ticket.csat_score === 3
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        : "bg-red-50 text-red-700 ring-1 ring-red-200"
                  }`}
                >
                  {ticket.csat_score}
                </span>
                <p className="text-sm font-semibold text-gray-900">{ticket.csat_score} / 5</p>
              </div>
              {ticket.csat_comment ? (
                <blockquote className="rounded-lg border-l-4 border-gray-300 bg-gray-50 px-3 py-2 text-sm italic text-gray-700">
                  {ticket.csat_comment}
                </blockquote>
              ) : null}
              <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Rated by</dt>
                  <dd className="capitalize text-gray-800">
                    {str(ticket.requester_type) || (ticket.provider_id ? "provider" : "customer")}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Submitted</dt>
                  <dd className="text-gray-800">{formatDateTime(ticket.csat_submitted_at)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Credited agent</dt>
                  <dd className="text-gray-800">
                    {ticket.csat_agent?.full_name ||
                      ticket.csat_agent?.email ||
                      (ticket.csat_agent_id ? `Agent ${String(ticket.csat_agent_id).slice(0, 8)}…` : "Unassigned at submission")}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-600">
              Awaiting rating
            </div>
          )}
        </div>
      </AdminPanel>
    </aside>
  );
}
