import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { adminToast } from "@/lib/adminToast";
import {
  formatStatusLabel,
  priorityPillClass,
  str,
  type QueueNavButtonLabel,
  type TicketRow,
} from "@/routes/support/ticket-detail/ticketDetailHelpers";

type TicketDetailHeaderProps = {
  ticket: TicketRow;
  ticketId: string;
  variant: "page" | "panel";
  ownerLabel: string | null;
  iAmAssignee: boolean;
  myStaffUserId: string;
  assignedId: string;
  patchPending: boolean;
  isFetching: boolean;
  queueNavLabel: QueueNavButtonLabel;
  queueNavDisabled?: boolean;
  queueBackHref: string;
  fullPageHref: string;
  fullPageState?: { queueTicketIds?: string[] };
  compactActions?: boolean;
  onNextInQueue: () => void;
  onRefresh: () => void;
  onAssignToMe: () => void;
  onClaimAndStart: () => void;
  onUnassign: () => void;
  claimStartDisabled: boolean;
};

export function TicketDetailHeader({
  ticket,
  ticketId,
  variant,
  ownerLabel,
  iAmAssignee,
  myStaffUserId,
  assignedId,
  patchPending,
  isFetching,
  queueNavLabel,
  queueNavDisabled = false,
  queueBackHref,
  fullPageHref,
  fullPageState,
  compactActions = false,
  onNextInQueue,
  onRefresh,
  onAssignToMe,
  onClaimAndStart,
  onUnassign,
  claimStartDisabled,
}: TicketDetailHeaderProps) {
  const isPanel = variant === "panel";
  const priority = str(ticket.priority) || "medium";
  const status = str(ticket.status);
  const TitleTag = isPanel ? "h2" : "h1";
  const [moreOpen, setMoreOpen] = useState(false);

  const secondaryActions = (
    <>
      {myStaffUserId ? (
        <>
          <button
            type="button"
            className="inline-flex min-h-9 w-full items-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 sm:w-auto"
            disabled={patchPending || assignedId === myStaffUserId}
            onClick={() => {
              setMoreOpen(false);
              onAssignToMe();
            }}
          >
            Assign to me
          </button>
          <button
            type="button"
            className="inline-flex min-h-9 w-full items-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 sm:w-auto"
            disabled={patchPending || claimStartDisabled}
            onClick={() => {
              setMoreOpen(false);
              onClaimAndStart();
            }}
          >
            Claim &amp; start
          </button>
        </>
      ) : null}
      {assignedId ? (
        <button
          type="button"
          className="inline-flex min-h-9 w-full items-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 sm:w-auto"
          disabled={patchPending}
          onClick={() => {
            setMoreOpen(false);
            onUnassign();
          }}
        >
          Unassign
        </button>
      ) : null}
      <button
        type="button"
        className="inline-flex min-h-9 w-full items-center text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline sm:w-auto"
        onClick={() => {
          setMoreOpen(false);
          onRefresh();
        }}
        disabled={isFetching}
      >
        {isFetching ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );

  return (
    <header className="shrink-0 space-y-2 border-b border-gray-100 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TitleTag
            className="line-clamp-2 text-base font-semibold text-gray-900 sm:text-lg"
            title={str(ticket.subject) || undefined}
          >
            {str(ticket.subject) || "Support ticket"}
          </TitleTag>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono text-gray-500 hover:text-gray-800"
              onClick={() => {
                const value = str(ticket.ticket_number);
                if (!value) return;
                void navigator.clipboard?.writeText(value).then(
                  () => adminToast.success("Ticket number copied"),
                  () => adminToast.error("Could not copy ticket number"),
                );
              }}
            >
              #{str(ticket.ticket_number) || "—"}
              <Copy className="h-3 w-3" aria-hidden />
            </button>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${priorityPillClass(priority)}`}>
              {priority}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-800">
              {formatStatusLabel(status)}
            </span>
            <span className="text-gray-500">
              Owner{" "}
              <span className="font-medium text-gray-800">{ownerLabel ?? "Unassigned"}</span>
              {iAmAssignee ? (
                <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                  You
                </span>
              ) : null}
            </span>
            {typeof ticket.csat_score === "number" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                CSAT {ticket.csat_score}/5
              </span>
            ) : status === "resolved" || status === "closed" ? (
              <span className="text-xs text-gray-500">Awaiting rating</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onNextInQueue}
          disabled={queueNavDisabled}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-default disabled:opacity-50"
        >
          {queueNavLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {compactActions ? (
          <>
            <div className="relative">
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                More
              </button>
              {moreOpen ? (
                <div className="absolute left-0 top-full z-30 mt-1 flex min-w-[11rem] flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                  {secondaryActions}
                </div>
              ) : null}
            </div>
            <Link
              to={fullPageHref}
              state={fullPageState}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
            >
              Open full page
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          </>
        ) : (
          <>
            {secondaryActions}
            {isPanel ? (
              <Link
                to={fullPageHref}
                state={fullPageState}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
              >
                Open full page
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            ) : (
              <Link
                to={queueBackHref}
                className="text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
              >
                ← Queue
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
}
