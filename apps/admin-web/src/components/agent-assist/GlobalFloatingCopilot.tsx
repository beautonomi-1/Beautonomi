import { useMemo, useState } from "react";
import { Bot, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { GLOBAL_COPILOT_STARTERS, useAdminCopilot, type CopilotPageContext } from "@/hooks/useAdminCopilot";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { adminSpaTo } from "@/lib/adminSpaPath";

function pageContextFromPath(pathname: string): CopilotPageContext | undefined {
  const p = pathname.replace(/^\/admin/, "") || pathname;
  const provider = /^\/providers\/([^/]+)/.exec(p);
  if (provider) return { entityType: "provider", entityId: provider[1]! };
  const user = /^\/users\/([^/]+)/.exec(p);
  if (user) return { entityType: "user", entityId: user[1]! };
  const ticket = /^\/support-tickets\/([^/]+)/.exec(p);
  if (ticket) return { entityType: "support_ticket", entityId: ticket[1]! };
  const booking = /^\/bookings\/([^/]+)/.exec(p);
  if (booking) return { entityType: "booking", entityId: booking[1]! };
  return undefined;
}

export function GlobalFloatingCopilot() {
  const location = useLocation();
  const pageContext = useMemo(() => pageContextFromPath(location.pathname), [location.pathname]);
  const { masterEnabled } = useAgentShadowMode();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const {
    ask,
    messages,
    busy,
    disambiguation,
    proposedAction,
    suggestedPrompts,
    pickDisambiguation,
    resetConversation,
  } = useAdminCopilot(pageContext);

  if (!masterEnabled) return null;

  const lastUserQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? question;

  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="Open Copilot"
          className="fixed bottom-6 end-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90"
          onClick={() => setOpen(true)}
        >
          <Bot className="h-6 w-6" />
        </button>
      ) : (
        <div className="fixed bottom-6 end-6 z-40 flex w-[min(100vw-2rem,24rem)] flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Copilot</span>
            <button type="button" aria-label="Close Copilot" onClick={() => setOpen(false)}>
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="max-h-72 flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Ask in plain language — no special format. I look up providers, customers, and bookings from
                  platform data.
                </p>
                <div className="flex flex-wrap gap-2">
                  {GLOBAL_COPILOT_STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      disabled={busy}
                      onClick={() => void ask(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className="text-sm text-gray-800">
                  <span className="font-medium">{m.role === "user" ? "You" : "Copilot"}:</span> {m.content}
                </div>
              ))
            )}
          </div>
          {suggestedPrompts?.length ? (
            <div className="flex flex-wrap gap-2 border-t border-gray-100 p-2">
              {suggestedPrompts.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                  disabled={busy}
                  onClick={() => void ask(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {disambiguation?.length ? (
            <div className="space-y-1 border-t border-gray-100 p-2">
              {disambiguation.map((opt) => (
                <button
                  key={`${opt.entityType}-${opt.entityId}`}
                  type="button"
                  className="block w-full rounded-lg bg-amber-50 px-2 py-1.5 text-left text-xs"
                  disabled={busy}
                  onClick={() => pickDisambiguation(opt, lastUserQuestion)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2 border-t border-gray-100 p-3">
            <input
              type="text"
              className="min-h-10 flex-1 rounded-lg border border-gray-200 px-2 text-sm"
              placeholder="Ask anything…"
              value={question}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && question.trim()) {
                  void ask(question);
                  setQuestion("");
                }
              }}
            />
            <button
              type="button"
              className="rounded-lg bg-primary px-3 text-sm text-white disabled:opacity-50"
              disabled={busy || !question.trim()}
              onClick={() => {
                void ask(question);
                setQuestion("");
              }}
            >
              Ask
            </button>
          </div>
          {proposedAction ? (
            <p className="border-t border-gray-100 px-3 pb-3 text-xs">
              <Link to={adminSpaTo(proposedAction.assistDeepLink)} className="text-primary underline">
                Review draft
              </Link>
            </p>
          ) : null}
          <button
            type="button"
            className="border-t border-gray-100 py-2 text-center text-xs text-gray-500 underline"
            onClick={() => resetConversation()}
          >
            New conversation
          </button>
        </div>
      )}
    </>
  );
}
