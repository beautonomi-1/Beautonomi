import { useEffect, useId, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import {
  getAgentAssistPresentation,
  humanStatusLabel,
  impactBadgeClass,
} from "@/lib/agentAssistCopy";
import { formatAdminDateTime, formatAdminExpiry, formatAdminRelativeTime } from "@/lib/formatAdminDateTime";
import type { AgentActionRow } from "@/lib/agentActionTypes";
import { ACTIONABLE_AGENT_STATUSES, PENDING_AGENT_STATUSES } from "@/lib/agentActionTypes";
import { useAgentActionMutations } from "./useAgentActionMutations";

function extractDraftText(action: AgentActionRow): string {
  const p = action.proposed_payload ?? {};
  const pres = getAgentAssistPresentation(action.action_type);
  if (pres.editableField === "draftReply" && typeof p.draftReply === "string") return p.draftReply;
  if (pres.editableField === "messageBody") {
    if (typeof p.messageBody === "string") return p.messageBody;
    if (typeof p.body === "string") return p.body;
    if (typeof p.draftMessage === "string") return p.draftMessage;
  }
  if (pres.editableField === "recommendation") {
    const rec = typeof p.recommendation === "string" ? p.recommendation : "";
    const rationale = typeof p.rationale === "string" ? p.rationale : "";
    if (rec && rationale) return `${rec.toUpperCase()}: ${rationale}`;
    return rationale || rec || JSON.stringify(p, null, 2);
  }
  if (typeof p.briefing === "string") return p.briefing;
  if (typeof p.rationale === "string") return p.rationale;
  return JSON.stringify(p, null, 2);
}

function buildPayloadOverride(action: AgentActionRow, editedText: string): Record<string, unknown> | undefined {
  const pres = getAgentAssistPresentation(action.action_type);
  if (!pres.editableField) return undefined;
  if (pres.editableField === "draftReply") return { draftReply: editedText };
  if (pres.editableField === "messageBody") {
    const p = action.proposed_payload ?? {};
    if ("messageBody" in p) return { messageBody: editedText };
    if ("body" in p) return { body: editedText };
    return { draftMessage: editedText };
  }
  if (pres.editableField === "recommendation") {
    const p = action.proposed_payload ?? {};
    return { ...p, rationale: editedText };
  }
  return undefined;
}

export function AgentAssistCard({
  action,
  entityLabel,
  shadowMode,
  highlightId,
  onUpdated,
  compact,
}: {
  action: AgentActionRow;
  entityLabel?: string;
  shadowMode?: boolean;
  highlightId?: string | null;
  onUpdated?: () => void;
  compact?: boolean;
}) {
  const pres = getAgentAssistPresentation(action.action_type);
  const statusUi = humanStatusLabel(action.status, shadowMode);
  const expiry = formatAdminExpiry(action.approval_expires_at);
  const draftId = useId();
  const initialDraft = useMemo(() => extractDraftText(action), [action]);
  const [draft, setDraft] = useState(initialDraft);
  const [edited, setEdited] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { approve, reject, execute, busy } = useAgentActionMutations({ onSuccess: onUpdated });

  useEffect(() => {
    setDraft(initialDraft);
    setEdited(false);
  }, [initialDraft, action.id]);

  const isHighlighted = highlightId === action.id;
  const canAct = PENDING_AGENT_STATUSES.has(action.status);
  const canExecute = action.status === "approved" && !shadowMode;

  const handleApproveFlow = async () => {
    const override = edited ? buildPayloadOverride(action, draft) : undefined;
    const res = await approve.mutateAsync({ id: action.id, payloadOverride: override });
    if (res.status === "approved" && !shadowMode) {
      // Omit payload hash so execute uses the server-side hash (e.g. after draft edits on approve).
      await execute.mutateAsync({ id: action.id });
    }
  };

  const previewNode = pres.editableField ? draft : extractDraftText(action);

  return (
    <article
      id={`agent-assist-${action.id}`}
      className={`rounded-2xl border bg-white p-4 shadow-sm ring-1 md:p-5 ${
        isHighlighted
          ? "border-primary/40 ring-primary/20"
          : "border-gray-200/90 ring-gray-950/[0.03]"
      }`}
      aria-labelledby={`${draftId}-title`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-primary">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-medium">AI suggestion</span>
          </div>
          <h3 id={`${draftId}-title`} className="text-base font-semibold text-gray-900">
            {pres.title}
          </h3>
          {entityLabel ? <p className="text-sm text-gray-600">{entityLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusUi.className}`}>
            {statusUi.label}
          </span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${impactBadgeClass(pres.impact)}`}>
            {pres.impactLabel}
          </span>
        </div>
      </header>

      <p className="mt-3 text-xs text-gray-500" title={formatAdminDateTime(action.created_at)}>
        Proposed {formatAdminRelativeTime(action.created_at)}
        {expiry.text ? ` · ${expiry.text}` : null}
      </p>

      <p className="mt-2 text-sm text-gray-700">{pres.consequenceLine}</p>

      {action.reasoning_summary ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{action.reasoning_summary}</p>
      ) : null}

      {!compact ? (
        <div className="mt-4">
          {pres.editableField && canAct ? (
            <>
              <label htmlFor={draftId} className="sr-only">
                Draft content
              </label>
              <textarea
                id={draftId}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setEdited(e.target.value !== initialDraft);
                }}
                rows={8}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm leading-relaxed text-gray-900 whitespace-pre-line"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canAct) {
                    e.preventDefault();
                    setConfirmOpen(true);
                  }
                }}
              />
              {edited ? <p className="mt-1 text-xs text-primary">Edited by you — this text will be sent if approved.</p> : null}
            </>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-sm whitespace-pre-line text-gray-800">
              {extractDraftText(action)}
            </div>
          )}
        </div>
      ) : null}

      {shadowMode && ACTIONABLE_AGENT_STATUSES.has(action.status) ? (
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
          Preview only. Approved replies will not send until the platform enables sending.
        </p>
      ) : null}

      {action.last_execution_error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {action.last_execution_error}
        </p>
      ) : null}

      <AdminMutationAlert errors={[approve.error, reject.error, execute.error]} />

      {(canAct || canExecute) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canAct ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy}
                aria-busy={busy}
                onClick={() => setConfirmOpen(true)}
              >
                {pres.primaryButtonLabel}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </button>
            </>
          ) : null}
          {canExecute ? (
            <button
              type="button"
              className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void execute.mutateAsync({ id: action.id, expectedPayloadHash: action.payload_hash })}
            >
              {busy ? "Sending…" : "Send now"}
            </button>
          ) : null}
        </div>
      )}

      <details className="mt-4 text-xs text-gray-500">
        <summary className="cursor-pointer font-medium text-gray-600">Technical details</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-gray-50 p-2 text-[11px] text-gray-700">
          {JSON.stringify(
            {
              id: action.id,
              action_type: action.action_type,
              target: `${action.target_type}/${action.target_id}`,
              status: action.status,
            },
            null,
            2,
          )}
        </pre>
      </details>

      <AdminConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={pres.title}
        consequence={pres.consequenceLine}
        preview={pres.impact === "customer_visible" || pres.impact === "mutation" ? previewNode : undefined}
        confirmLabel={pres.primaryButtonLabel}
        variant={pres.impact === "mutation" && action.action_type === "moderation.hide" ? "danger" : "primary"}
        busy={busy}
        onConfirm={async () => {
          await handleApproveFlow();
          setConfirmOpen(false);
        }}
      />

      <AdminConfirmDialog
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          setRejectReason("");
        }}
        title="Reject AI suggestion"
        consequence="This draft will leave the queue and will not be sent."
        confirmLabel="Reject"
        variant="danger"
        busy={busy}
        preview={
          <label className="block space-y-2">
            <span className="text-sm text-gray-600">Reason (optional)</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        }
        onConfirm={async () => {
          await reject.mutateAsync({ id: action.id, comments: rejectReason.trim() || undefined });
          setRejectOpen(false);
          setRejectReason("");
        }}
      />
    </article>
  );
}
