import { useState } from "react";
import { Bot } from "lucide-react";
import { Link } from "react-router";
import type { AdminSection } from "@beautonomi/admin-access";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { useAdminCopilot, type CopilotPageContext } from "@/hooks/useAdminCopilot";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function DomainCopilotDock({
  section: _section,
  starters,
  pageContext,
}: {
  section: AdminSection;
  starters?: string[];
  pageContext?: CopilotPageContext;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const { ask, messages, busy, disambiguation, proposedAction, pickDisambiguation, resetConversation } =
    useAdminCopilot(pageContext);

  const lastUserQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? question;

  const submit = () => {
    void ask(question);
    setQuestion("");
  };

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-4 w-4" aria-hidden />
        Ask Copilot
      </button>
    );
  }

  return (
    <AdminPanel title="Copilot (read-only)" className="border-primary/20">
      {pageContext?.label ? (
        <p className="mb-3 text-sm text-gray-600">Context: {pageContext.label}</p>
      ) : null}

      {messages.length > 0 ? (
        <div className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 p-3">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`text-sm ${m.role === "user" ? "text-gray-900" : "text-gray-700"}`}
            >
              <span className="font-medium">{m.role === "user" ? "You" : "Copilot"}:</span> {m.content}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {(starters ?? []).map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            disabled={busy}
            onClick={() => void ask(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {disambiguation?.length ? (
        <div className="mb-3 space-y-2">
          <p className="text-sm font-medium text-gray-800">Pick one:</p>
          {disambiguation.map((opt) => (
            <button
              key={`${opt.entityType}-${opt.entityId}`}
              type="button"
              className="block w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100"
              disabled={busy}
              onClick={() => pickDisambiguation(opt, lastUserQuestion)}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.subtitle ? <span className="ml-2 text-gray-600">{opt.subtitle}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="text"
          className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
          placeholder="Ask about this record…"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          type="button"
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !question.trim()}
          onClick={submit}
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>

      {proposedAction ? (
        <p className="mt-3 text-sm">
          <Link to={adminSpaTo(proposedAction.assistDeepLink)} className="font-medium text-primary underline">
            Review draft in AI suggestion
          </Link>
        </p>
      ) : null}

      <div className="mt-3 flex gap-3 text-xs text-gray-500">
        <button type="button" className="underline" onClick={() => resetConversation()}>
          New conversation
        </button>
        <button type="button" className="underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </AdminPanel>
  );
}
