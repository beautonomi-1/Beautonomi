import { useState } from "react";
import { Bot } from "lucide-react";
import type { AdminSection } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToast } from "@/lib/adminToast";

export function DomainCopilotDock({
  section: _section,
  starters,
  contextHint,
}: {
  section: AdminSection;
  starters?: string[];
  contextHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{
    text: string;
    toolCalls?: number;
    deniedTools?: string[];
  } | null>(null);

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const question = contextHint ? `${contextHint}\n\n${trimmed}` : trimmed;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await adminApi.postJson<{
        answer?: string;
        toolCalls?: number;
        deniedTools?: string[];
      }>("/api/admin/copilot", { question });
      setAnswer({
        text: res.answer ?? "No answer returned.",
        toolCalls: res.toolCalls,
        deniedTools: res.deniedTools,
      });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Copilot failed");
    } finally {
      setBusy(false);
    }
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
      {contextHint ? <p className="mb-3 text-sm text-gray-600">{contextHint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {(starters ?? []).map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <label htmlFor="copilot-question" className="sr-only">
        Ask Copilot
      </label>
      <textarea
        id="copilot-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="Ask about this item…"
        className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void ask(question)}
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 text-sm text-gray-700"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      {answer ? (
        <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-800" role="status" aria-live="polite">
          <p className="whitespace-pre-line">{answer.text}</p>
          {answer.toolCalls != null ? (
            <p className="text-xs text-gray-500">Based on {answer.toolCalls} authorized read(s)</p>
          ) : null}
          {answer.deniedTools?.length ? (
            <p className="text-xs text-amber-800">Could not access: {answer.deniedTools.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </AdminPanel>
  );
}
