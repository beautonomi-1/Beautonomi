import { Fragment, type ReactNode, type RefObject } from "react";
import { Copy, FileText } from "lucide-react";
import { LinkifiedMessageText } from "@/lib/linkifyMessage";
import { adminToast } from "@/lib/adminToast";
import { supportTicketMessageHref } from "@/lib/supportTicketMessageLink";
import {
  attachmentsFromRow,
  deliveryStatusBadge,
  formatFileSize,
  isImageAttachment,
  messageDayLabel,
  messageTrailRole,
  relativeTime,
  str,
  type ThreadItem,
} from "@/routes/support/ticket-detail/ticketDetailHelpers";

type TicketThreadProps = {
  threadRef: RefObject<HTMLDivElement | null>;
  threadItems: ThreadItem[];
  ticketId: string;
  customerUserId: string | null;
  originalRequestText: string | null;
  ticketCreatedAt?: string;
  scrollMode?: "panel" | "page" | "page-mobile";
  /** Rendered at the top of the scrollport (SLA, email, AI on desktop). */
  threadTop?: ReactNode;
};

export function TicketThread({
  threadRef,
  threadItems,
  ticketId,
  customerUserId,
  originalRequestText,
  ticketCreatedAt,
  scrollMode = "panel",
  threadTop,
}: TicketThreadProps) {
  const scrollClass =
    scrollMode === "page-mobile"
      ? "min-h-0 flex-none px-1 py-3"
      : "admin-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-3";

  return (
    <div ref={threadRef} className={scrollClass}>
      {threadTop ? <div className="mb-3 space-y-2">{threadTop}</div> : null}
      {originalRequestText ? (
        <div className="mb-3 flex w-full justify-start">
          <div className="max-w-[min(100%,42rem)] rounded-xl border border-emerald-300 bg-emerald-50 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-emerald-200 px-2 py-0.5 font-semibold text-emerald-950">Original request</span>
              {ticketCreatedAt ? (
                <>
                  <span>·</span>
                  <time dateTime={ticketCreatedAt} title={new Date(ticketCreatedAt).toLocaleString()}>
                    {relativeTime(ticketCreatedAt)}
                  </time>
                </>
              ) : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{originalRequestText}</p>
          </div>
        </div>
      ) : null}

      <ul className="space-y-4">
        {threadItems.length === 0 && !originalRequestText ? (
          <li className="text-sm text-gray-500">No messages yet.</li>
        ) : (
          threadItems.map((item, idx) => {
            const dayLabel = messageDayLabel(item.created_at);
            const prevDayLabel = idx > 0 ? messageDayLabel(threadItems[idx - 1]?.created_at) : "";

            if (item.kind === "note") {
              const n = item.row;
              return (
                <Fragment key={item.id}>
                  {dayLabel && dayLabel !== prevDayLabel ? (
                    <li className="flex justify-center">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                        {dayLabel}
                      </span>
                    </li>
                  ) : null}
                  <li id={`note-${item.id}`} className="group flex w-full justify-end">
                    <div className="relative max-w-[min(100%,42rem)] rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-950">Team note</span>
                        <span>·</span>
                        <span>{n.user?.full_name || n.user?.email || "Staff"}</span>
                        <span>·</span>
                        <time dateTime={n.created_at ? String(n.created_at) : undefined} title={n.created_at ? new Date(String(n.created_at)).toLocaleString() : undefined}>
                          {n.created_at ? relativeTime(String(n.created_at)) : "—"}
                        </time>
                        <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-950">
                          Legacy note · staff only
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-gray-800">{str(n.note)}</p>
                    </div>
                  </li>
                </Fragment>
              );
            }

            const m = item.row;
            const role = messageTrailRole(m, customerUserId);
            const internal = role === "internal";
            const alignEnd = role === "staff" || role === "internal" || role === "auto";
            const bubble =
              role === "internal"
                ? "border-amber-300 bg-amber-100"
                : role === "assistant"
                  ? "border-violet-300 bg-violet-100"
                  : role === "staff"
                    ? "border-blue-300 bg-blue-100"
                    : role === "auto"
                      ? "border-slate-300 bg-slate-100"
                      : "border-emerald-300 bg-emerald-50";
            const rolePill =
              role === "internal"
                ? "bg-amber-200 text-amber-950"
                : role === "assistant"
                  ? "bg-violet-200 text-violet-950"
                  : role === "staff"
                    ? "bg-blue-200 text-blue-950"
                    : role === "auto"
                      ? "bg-slate-200 text-slate-900"
                      : "bg-emerald-200 text-emerald-950";
            const atts = attachmentsFromRow(m.attachments);
            const roleLabel =
              role === "auto"
                ? "Automatic acknowledgement"
                : role === "internal"
                  ? "Internal note"
                  : role === "assistant"
                    ? "Assistant"
                    : role === "customer"
                      ? "Customer"
                      : "Support";
            const messageId = str(m.id);
            const deliveryBadge = !internal ? deliveryStatusBadge(m.email_delivery_status) : null;
            const createdAt = m.created_at ? String(m.created_at) : undefined;

            return (
              <Fragment key={item.id}>
                {dayLabel && dayLabel !== prevDayLabel ? (
                  <li className="flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                      {dayLabel}
                    </span>
                  </li>
                ) : null}
                <li
                  id={`message-${messageId}`}
                  className={`group flex w-full ${alignEnd ? "justify-end" : "justify-start"}`}
                >
                  <div className={`relative max-w-[min(100%,42rem)] rounded-xl border px-4 py-3 shadow-sm ${bubble}`}>
                    <div className="flex flex-wrap items-center gap-2 pe-8 text-xs text-gray-500">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${rolePill}`}>{roleLabel}</span>
                      <span>·</span>
                      <span>{m.user?.full_name || m.user?.email || "User"}</span>
                      <span>·</span>
                      <time dateTime={createdAt} title={createdAt ? new Date(createdAt).toLocaleString() : undefined}>
                        {createdAt ? relativeTime(createdAt) : "—"}
                      </time>
                      {deliveryBadge ? <span className={deliveryBadge.className}>{deliveryBadge.label}</span> : null}
                      {internal ? (
                        <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-amber-950">Not visible to customer</span>
                      ) : null}
                    </div>
                      {messageId ? (
                        <button
                          type="button"
                          className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-md p-1.5 text-gray-500 opacity-0 transition-opacity hover:bg-white/70 hover:text-gray-800 group-hover:opacity-100 focus:opacity-100"
                          aria-label="Copy message link"
                          onClick={() => {
                            const href = supportTicketMessageHref(ticketId, messageId);
                            void navigator.clipboard?.writeText(href).then(
                              () => adminToast.success("Message link copied"),
                              () => adminToast.error("Could not copy link"),
                            );
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      ) : null}
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-gray-800">
                      <LinkifiedMessageText text={str(m.message)} />
                    </p>
                    {atts.length > 0 ? (
                      <ul className="mt-3 grid gap-2 border-t border-dashed border-gray-200 pt-2 text-xs sm:grid-cols-2">
                        {atts.map((a) => (
                          <li key={a.url}>
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-lg border border-gray-200 bg-white/70 hover:border-gray-300"
                            >
                              {isImageAttachment(a) ? (
                                <img src={a.url} alt={a.name || "Attachment"} className="h-28 w-full object-cover" loading="lazy" />
                              ) : null}
                              <span className="flex items-center gap-2 px-2 py-2 font-medium text-gray-800">
                                <FileText className="h-3.5 w-3.5 text-gray-500" />
                                <span className="min-w-0 flex-1 truncate">{a.name || "Attachment"}</span>
                                {a.size != null ? <span className="shrink-0 text-gray-500">{formatFileSize(a.size)}</span> : null}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              </Fragment>
            );
          })
        )}
      </ul>
    </div>
  );
}
