import { useEffect, useRef, useState, type RefObject } from "react";
import { BookOpen, ChevronDown, FileText, Paperclip, Send, X } from "lucide-react";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { DomainCopilotDock } from "@/components/agent-assist/DomainCopilotDock";
import { LearningArticlePicker } from "@/components/learning/LearningArticlePicker";
import type { KbArticleResult, KbAudience } from "@/lib/learning";
import { SUPPORT_TICKET_CANNED_RESPONSES } from "@/lib/supportTicketCannedResponses";
import { adminPrimaryButtonClass } from "@/lib/adminUi";
import { str, type AttachmentItem, type TicketRow } from "@/routes/support/ticket-detail/ticketDetailHelpers";
import { formatFileSize, isImageAttachment } from "@/routes/support/ticket-detail/ticketDetailHelpers";

type TicketComposerProps = {
  ticket: TicketRow;
  ticketId: string;
  reply: string;
  setReply: (v: string | ((prev: string) => string)) => void;
  replyInternal: boolean;
  setReplyInternal: (v: boolean) => void;
  replyAttachments: AttachmentItem[];
  setReplyAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  replyAudience: KbAudience;
  onInsertArticle: (article: KbArticleResult) => void;
  onSend: (nextStatus?: string) => void;
  sendPending: boolean;
  patchPending: boolean;
  uploading: boolean;
  uploadErr: string | null;
  onPickFiles: (files: FileList | null) => void;
  fileRef: RefObject<HTMLInputElement | null>;
};

export function TicketComposer({
  ticket,
  ticketId,
  reply,
  setReply,
  replyInternal,
  setReplyInternal,
  replyAttachments,
  setReplyAttachments,
  replyAudience,
  onInsertArticle,
  onSend,
  sendPending,
  patchPending,
  uploading,
  uploadErr,
  onPickFiles,
  fileRef,
}: TicketComposerProps) {
  const [dragActive, setDragActive] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [articlesOpen, setArticlesOpen] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const articlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!articlesOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!articlesRef.current?.contains(e.target as Node)) setArticlesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [articlesOpen]);

  useEffect(() => {
    if (!sendMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!sendMenuRef.current?.contains(e.target as Node)) setSendMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSendMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sendMenuOpen]);

  const hasContent = reply.trim().length > 0 || replyAttachments.length > 0;
  const disabled = !hasContent || sendPending || patchPending;

  return (
    <div
      className="z-10 shrink-0 border-t border-gray-200 bg-white pb-1 pe-16 pt-3 sm:pe-20"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        void onPickFiles(e.dataTransfer.files);
      }}
    >
      {replyInternal ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-medium">Team note mode</p>
          <p className="mt-0.5 text-amber-800">Only staff can see this note.</p>
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 font-medium transition-colors ${
              !replyInternal ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:bg-white"
            }`}
            onClick={() => setReplyInternal(false)}
          >
            Reply to customer
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 font-medium transition-colors ${
              replyInternal ? "bg-amber-500 text-amber-950 shadow-sm" : "text-gray-700 hover:bg-white"
            }`}
            onClick={() => setReplyInternal(true)}
          >
            Internal note
          </button>
        </div>
        <p className={`text-xs ${replyInternal ? "text-amber-700" : "text-gray-500"}`}>
          {replyInternal ? "Staff only." : "Visible to the customer."}
        </p>
      </div>

      <textarea
        className={`mb-2 w-full min-h-[88px] rounded-xl border px-3 py-2 text-sm focus:outline-none ${
          replyInternal
            ? "border-amber-300 bg-amber-50/70 focus:border-amber-500"
            : "border-gray-300 bg-white focus:border-gray-500"
        }`}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            if (!disabled) void onSend();
          }
          if (e.key === "Escape") {
            if (sendMenuOpen) {
              e.preventDefault();
              setSendMenuOpen(false);
              return;
            }
            if (reply.trim()) {
              e.preventDefault();
              setReply("");
            }
          }
        }}
        placeholder={replyInternal ? "Add context for teammates…" : "Type a clear reply to the customer…"}
      />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <select
          className="min-h-10 min-w-[10rem] max-w-[min(100%,18rem)] flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 sm:flex-none"
          defaultValue=""
          aria-label="Insert canned reply"
          onChange={(e) => {
            const label = e.target.value;
            e.target.value = "";
            if (!label) return;
            const snippet = SUPPORT_TICKET_CANNED_RESPONSES.find((c) => c.label === label);
            if (!snippet) return;
            setReply((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet.body}` : snippet.body));
          }}
        >
          <option value="">Snippet…</option>
          {SUPPORT_TICKET_CANNED_RESPONSES.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="relative" ref={articlesRef}>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50/70 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100"
            aria-expanded={articlesOpen}
            onClick={() => setArticlesOpen((o) => !o)}
          >
            <BookOpen className="h-3.5 w-3.5 text-purple-600" aria-hidden />
            Help articles
          </button>
          {articlesOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-[min(100vw-2rem,20rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              <LearningArticlePicker
                audience={replyAudience}
                includeInternal={replyInternal}
                onInsert={(article) => {
                  onInsertArticle(article);
                  setArticlesOpen(false);
                }}
                initialQuery={str(ticket.subject)}
                placeholder="Search guides…"
              />
            </div>
          ) : null}
        </div>
        <DomainCopilotDock
          section={ADMIN_SECTION_SUPPORT}
          compact
          pageContext={{
            entityType: "support_ticket",
            entityId: ticketId,
            label: str(ticket.ticket_number) || str(ticket.subject) || undefined,
          }}
          starters={["Summarize this ticket", "Draft a reply to the customer"]}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={(e) => void onPickFiles(e.target.files)}
      />

      {(dragActive || replyAttachments.length > 0) && (
        <div
          className={`mb-2 rounded-xl border border-dashed p-3 transition-colors ${
            dragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50/80"
          }`}
        >
          {replyAttachments.length === 0 ? (
            <p className="text-xs text-gray-600">Drop files here or use the paperclip.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {replyAttachments.map((a) => (
                <li key={a.url} className="overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-sm">
                  {isImageAttachment(a) ? (
                    <img src={a.url} alt={a.name || "Attachment preview"} className="h-20 w-full object-cover" loading="lazy" />
                  ) : null}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1 truncate text-gray-700">{a.name || "file"}</span>
                    {a.size != null ? <span className="shrink-0 text-gray-500">{formatFileSize(a.size)}</span> : null}
                    <button
                      type="button"
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      aria-label={`Remove ${a.name || "attachment"}`}
                      onClick={() => setReplyAttachments((prev) => prev.filter((x) => x.url !== a.url))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {uploadErr ? <p className="mb-2 text-sm text-red-600">{uploadErr}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {replyInternal ? (
          <button
            type="button"
            className={adminPrimaryButtonClass(disabled)}
            disabled={disabled}
            onClick={() => void onSend()}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {sendPending ? "Sending…" : "Save internal note"}
          </button>
        ) : (
          <div className="relative inline-flex" ref={sendMenuRef}>
            <button
              type="button"
              className={`${adminPrimaryButtonClass(disabled)} rounded-r-none`}
              disabled={disabled}
              onClick={() => void onSend()}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {sendPending ? "Sending…" : "Send reply"}
            </button>
            <button
              type="button"
              className={`${adminPrimaryButtonClass(disabled)} rounded-l-none border-l border-white/20 px-2`}
              disabled={disabled}
              aria-expanded={sendMenuOpen}
              aria-haspopup="menu"
              aria-label="More send options"
              onClick={() => setSendMenuOpen((o) => !o)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {sendMenuOpen ? (
              <div
                className="absolute bottom-full left-0 z-20 mb-1 min-w-[14rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    setSendMenuOpen(false);
                    void onSend("resolved");
                  }}
                >
                  Send and resolve
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                  onClick={() => {
                    setSendMenuOpen(false);
                    void onSend("waiting_customer");
                  }}
                >
                  Send and wait for customer
                </button>
              </div>
            ) : null}
          </div>
        )}
        <p className="text-xs text-gray-500">Cmd/Ctrl+Enter to send · Esc to clear draft</p>
      </div>
    </div>
  );
}
