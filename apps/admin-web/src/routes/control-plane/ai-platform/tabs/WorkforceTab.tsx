import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpField } from "../../cpShared";
import { ModelCatalogPicker } from "../ModelCatalogPicker";
import { agentConsoleDeepLink } from "../agentConsoleDeepLink";
import { TASK_DEFAULTS } from "../constants";
import type { AiPlatformPayload, SelectableModel } from "../types";

export function WorkforceTab(props: {
  data: AiPlatformPayload;
  selectableModels: SelectableModel[];
  routingPolicyJson: string;
  setRoutingPolicyJson: (v: string) => void;
  agentDailyCapUsd: number | "";
  setAgentDailyCapUsd: (v: number | "") => void;
  onSaveModule: (patch: Record<string, unknown>) => void;
  onSaveBrain: (agentId: string, patch: Record<string, unknown>) => void;
  onSaveState: (agentId: string, state: string) => void;
  saving: boolean;
}) {
  const wf = props.data.workforce;
  const module = wf.module;

  return (
    <div className="space-y-4">
      <AdminPanel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Agent workforce</h3>
            <p className="text-xs text-gray-500">
              {wf.gate_status.active_agents} active · {wf.gate_status.pending_approvals} pending approvals ·{" "}
              <Link to={adminSpaTo("/admin/control-plane/modules/agents")} className="text-blue-700 underline">Open Agentic Console</Link> for inbox & runs
            </p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="space-y-3">
        <h3 className="text-sm font-semibold">Module controls</h3>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={module.master_enabled}
              disabled={props.saving}
              onChange={(e) => props.onSaveModule({ master_enabled: e.target.checked, shadow_mode: module.shadow_mode })}
            />
            Master enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={module.shadow_mode !== false}
              disabled={props.saving}
              onChange={(e) => props.onSaveModule({ shadow_mode: e.target.checked, master_enabled: module.master_enabled })}
            />
            Shadow mode (proposals only)
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <CpField label="Agent daily spend cap (USD)">
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border px-2 py-1.5 text-sm"
              value={props.agentDailyCapUsd}
              onChange={(e) => props.setAgentDailyCapUsd(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
            />
          </CpField>
          <CpField label="Default routing policy (JSON)">
            <textarea
              className="min-h-[4rem] w-full rounded-lg border font-mono text-xs"
              value={props.routingPolicyJson}
              onChange={(e) => props.setRoutingPolicyJson(e.target.value)}
              placeholder='{"taskTier":{"classification":"lite"},"taskModel":{"copilot":"openai/gpt-5-mini"}}'
            />
          </CpField>
        </div>
        <p className="text-xs text-gray-500">Save routing policy and spend cap from the sticky save bar (Gateway/Budgets tabs share it).</p>
      </AdminPanel>

      <AdminPanel className="space-y-3 overflow-x-auto">
        <h3 className="text-sm font-semibold">Agent roster</h3>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 pr-3">Preferred model</th>
              <th className="py-2 pr-3">Fallback</th>
              <th className="py-2 pr-3">Task</th>
              <th className="py-2 pr-3">7d spend</th>
              <th className="py-2 pr-3">Console</th>
              <th className="py-2">Crons</th>
            </tr>
          </thead>
          <tbody>
            {wf.agents.map((a) => (
              <tr key={a.key} className={`border-b border-gray-100 ${a.missing_definition ? "bg-amber-50/50" : ""}`}>
                <td className="py-2 pr-3 align-top">
                  <div className="font-medium">{a.display_name}</div>
                  <div className="font-mono text-xs text-gray-500">{a.key}</div>
                  {a.missing_definition ? <span className="text-xs text-amber-800">Missing in DB</span> : null}
                  {!a.catalog_model_valid && a.preferred_model_id ? (
                    <span className="text-xs text-amber-800">Model not enabled/eval-passed</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 align-top">
                  {a.id ? (
                    <select
                      className="rounded border text-xs"
                      value={a.state}
                      disabled={props.saving || a.missing_definition}
                      onChange={(e) => props.onSaveState(a.id!, e.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="draining">draining</option>
                      <option value="disabled">disabled</option>
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 align-top min-w-[10rem]">
                  {a.id ? (
                    <ModelCatalogPicker
                      models={props.selectableModels}
                      value={a.preferred_model_id ?? ""}
                      allowEmpty
                      onChange={(v) => props.onSaveBrain(a.id!, { preferred_model_id: v || null })}
                      disabled={props.saving}
                    />
                  ) : null}
                </td>
                <td className="py-2 pr-3 align-top min-w-[10rem]">
                  {a.id ? (
                    <ModelCatalogPicker
                      models={props.selectableModels}
                      value={a.fallback_model_id ?? ""}
                      allowEmpty
                      onChange={(v) => props.onSaveBrain(a.id!, { fallback_model_id: v || null })}
                      disabled={props.saving}
                    />
                  ) : null}
                </td>
                <td className="py-2 pr-3 align-top">
                  {a.id ? (
                    <select
                      className="rounded border text-xs"
                      defaultValue={a.task_default ?? "classification"}
                      disabled={props.saving}
                      onChange={(e) => props.onSaveBrain(a.id!, { task_default: e.target.value })}
                    >
                      {TASK_DEFAULTS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : null}
                  <label className="mt-1 flex items-center gap-1 text-xs">
                    {a.id ? (
                      <>
                        <input
                          type="checkbox"
                          defaultChecked={a.vision_enabled}
                          onChange={(e) => props.onSaveBrain(a.id!, { vision_enabled: e.target.checked })}
                        />
                        vision
                      </>
                    ) : null}
                  </label>
                </td>
                <td className="py-2 pr-3 align-top text-xs">${a.spend_7d_usd.toFixed(4)}</td>
                <td className="py-2 pr-3 align-top text-xs">
                  {a.id ? (
                    <div className="flex flex-col gap-1">
                      <Link to={agentConsoleDeepLink({ agentId: a.id, panel: "proposals" })} className="text-blue-700 underline">
                        Proposals
                      </Link>
                      <Link to={agentConsoleDeepLink({ agentId: a.id, panel: "runs" })} className="text-blue-700 underline">
                        Runs
                      </Link>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 align-top text-xs text-gray-600">
                  {a.cron_labels.map((c) => <div key={c}>{c}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Cron schedules</h3>
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-gray-500 text-xs"><th className="py-1">Job</th><th className="py-1">Schedule (UTC)</th><th className="py-1">Path</th></tr></thead>
          <tbody>
            {wf.cron_schedules.map((c) => (
              <tr key={c.name} className="border-b border-gray-100">
                <td className="py-1 font-mono text-xs">{c.name}</td>
                <td className="py-1 text-xs">{c.schedule}</td>
                <td className="py-1 font-mono text-xs">{c.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminPanel>
    </div>
  );
}
