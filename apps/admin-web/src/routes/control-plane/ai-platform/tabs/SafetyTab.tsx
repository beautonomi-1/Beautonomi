import { useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpField } from "../../cpShared";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { HARM_CATEGORIES, THRESHOLDS } from "../constants";
import type { AiPlatformPayload } from "../types";

export function SafetyTab(props: {
  env: string;
  data: AiPlatformPayload;
  runtime: string;
  safety: Record<string, string>;
  setSafety: (v: Record<string, string>) => void;
  advancedSafetyJson: string;
  setAdvancedSafetyJson: (v: string) => void;
  showAdvancedSafety: boolean;
  setShowAdvancedSafety: (v: boolean) => void;
  onReload: () => void;
  onSaveAgentEmergency: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const aiEmergency = props.data.emergency ?? {};
  const agentEmergency = props.data.workforce.emergency;
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<{ kind: string; apply: () => void } | null>(null);

  const postAiEmergency = async (patch: Record<string, unknown>) => {
    await adminApi.postJson("/api/admin/control-plane/integrations/ai/emergency", {
      environment: props.env,
      ...patch,
      reason: reason.trim() || "admin toggle",
    });
    setReason("");
    props.onReload();
  };

  const confirmAiToggle = (label: string, patch: Record<string, unknown>, needsReason = false) => {
    if (needsReason && !reason.trim()) {
      alert("Reason required for this control");
      return;
    }
    setConfirm({
      kind: label,
      apply: () => void postAiEmergency(patch),
    });
  };

  return (
    <div className="space-y-4">
      <AdminPanel>
        <CpField label="Reason (required for stop-all / template fallback)">
          <input className="w-full rounded-lg border px-2 py-1.5 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </CpField>
      </AdminPanel>

      <AdminPanel className="space-y-3 border-red-200 bg-red-50/30">
        <h3 className="text-sm font-semibold text-red-900">AI emergency (callLlm)</h3>
        <p className="text-xs text-gray-600">Blocks provider AI and all agent LLM calls through the shared runtime.</p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(aiEmergency.stop_all_calls)} onChange={(e) => confirmAiToggle("Stop all LLM calls", { stop_all_calls: e.target.checked, force_template_fallback: Boolean(aiEmergency.force_template_fallback) }, true)} />
            Stop all LLM calls
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(aiEmergency.force_template_fallback)} onChange={(e) => confirmAiToggle("Force template fallback", { stop_all_calls: Boolean(aiEmergency.stop_all_calls), force_template_fallback: e.target.checked }, true)} />
            Force template fallback
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(aiEmergency.disable_streaming)} onChange={(e) => confirmAiToggle("Disable streaming", { disable_streaming: e.target.checked })} />
            Disable streaming
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(aiEmergency.disable_vision)} onChange={(e) => confirmAiToggle("Disable vision", { disable_vision: e.target.checked })} />
            Disable vision
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(aiEmergency.disable_embeddings)} onChange={(e) => confirmAiToggle("Disable embeddings", { disable_embeddings: e.target.checked })} />
            Disable embeddings
          </label>
        </div>
        <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => confirmAiToggle("Clear AI kill switches", { stop_all_calls: false, force_template_fallback: false, disable_streaming: false, disable_vision: false, disable_embeddings: false })}>
          Clear AI kill switches
        </button>
      </AdminPanel>

      <AdminPanel className="space-y-3 border-amber-200 bg-amber-50/30">
        <h3 className="text-sm font-semibold text-amber-900">Agent emergency (workforce)</h3>
        <p className="text-xs text-gray-600">Separate from AI kill switches — controls crons, tools, proposals, and execution.</p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          {(
            [
              ["stop_new_runs", "Stop new agent runs"],
              ["stop_all_tool_calls", "Stop all tool calls"],
              ["block_approved_execution", "Block approved execution"],
              ["freeze_pending_proposals", "Freeze pending proposals"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(agentEmergency[key])}
                disabled={props.saving}
                onChange={(e) =>
                  setConfirm({
                    kind: label,
                    apply: () => props.onSaveAgentEmergency({ [key]: e.target.checked }),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </AdminPanel>

      {props.runtime === "direct_gemini" ? (
        <AdminPanel className="space-y-3">
          <h3 className="text-sm font-semibold">Gemini safety (direct rollback path)</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={props.showAdvancedSafety} onChange={(e) => props.setShowAdvancedSafety(e.target.checked)} />
            Advanced JSON
          </label>
          {props.showAdvancedSafety ? (
            <textarea className="min-h-[120px] w-full rounded-lg border font-mono text-xs" value={props.advancedSafetyJson} onChange={(e) => props.setAdvancedSafetyJson(e.target.value)} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {HARM_CATEGORIES.map((cat) => (
                <CpField key={cat} label={cat.replace("HARM_CATEGORY_", "").replace(/_/g, " ")}>
                  <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.safety[cat] ?? "BLOCK_MEDIUM_AND_ABOVE"} onChange={(e) => props.setSafety({ ...props.safety, [cat]: e.target.value })}>
                    {THRESHOLDS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
                  </select>
                </CpField>
              ))}
            </div>
          )}
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Glossary</h3>
        <dl className="space-y-2 text-xs text-gray-700">
          <div><dt className="font-medium">lite / flash / pro</dt><dd>Cost tiers for routeModel — lite is cheapest, pro for high-risk reasoning.</dd></div>
          <div><dt className="font-medium">Eval gate</dt><dd>In production, enabled catalog models need eval_passed_at before use.</dd></div>
          <div><dt className="font-medium">Shadow mode</dt><dd>Agents propose actions but approved mutations do not execute.</dd></div>
        </dl>
      </AdminPanel>

      <AdminConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={`Confirm: ${confirm?.kind ?? ""}`}
        consequence={`This takes effect immediately for ${props.env}.`}
        onConfirm={() => {
          confirm?.apply();
          setConfirm(null);
        }}
      />
    </div>
  );
}
