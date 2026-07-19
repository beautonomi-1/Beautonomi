import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, EnvSelect } from "./cpShared";

type AgentAction = {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  status: string;
  risk_level: number;
  reasoning_summary: string | null;
  proposed_payload: Record<string, unknown>;
  approval_expires_at: string | null;
  proposed_at: string | null;
  approved_at: string | null;
  executed_at: string | null;
  last_execution_error: string | null;
  created_at: string;
};

type AgentRun = {
  id: string;
  workflow_type: string;
  status: string;
  trigger_kind: string;
  shadow_mode: boolean;
  started_at: string;
  ended_at: string | null;
  escalation_count: number;
  error_class: string | null;
};

type AgentStep = {
  id: string;
  seq: number;
  kind: string;
  tool_name: string | null;
  model_id: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number | null;
  policy_denied: boolean;
  error: string | null;
};

const RISK_STYLES: Record<number, string> = {
  0: "bg-gray-100 text-gray-700",
  1: "bg-blue-100 text-blue-800",
  2: "bg-amber-100 text-amber-800",
  3: "bg-red-100 text-red-800",
};

const ACTIONABLE_STATUSES = new Set(["proposed", "approval_pending"]);

function riskBadge(level: number) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${RISK_STYLES[level] ?? RISK_STYLES[2]}`}>
      risk {level}
    </span>
  );
}

function expiryLabel(expiresAt: string | null): { text: string; expired: boolean } {
  if (!expiresAt) return { text: "no expiry", expired: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: "expired", expired: true };
  const mins = Math.round(ms / 60_000);
  return { text: mins >= 60 ? `expires in ${Math.round(mins / 60)}h` : `expires in ${mins}m`, expired: false };
}

type AgentModuleResponse = {
  module: {
    master_enabled: boolean;
    shadow_mode: boolean;
    global_daily_spend_cap_usd: number | null;
  } | null;
  agents: Array<{
    id: string;
    key: string;
    display_name: string;
    admin_role: string;
    risk_ceiling: number;
    agent_operational_state?: { state: string } | null;
  }>;
  emergency: {
    stop_new_runs: boolean;
    stop_all_tool_calls: boolean;
    block_approved_execution: boolean;
    freeze_pending_proposals: boolean;
  } | null;
};

export function CpAgenticConsolePage() {
  const { allowed, denied } = useSuperadminPage("Agentic console is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<AgentModuleResponse | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runSteps, setRunSteps] = useState<Record<string, AgentStep[]>>({});
  const [copilotQ, setCopilotQ] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotResult, setCopilotResult] = useState<{
    answer: string;
    deniedTools: string[];
    toolCalls: number;
    modelUsed?: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const actionsPath = statusFilter
        ? `/api/admin/agent-actions?status=${encodeURIComponent(statusFilter)}`
        : "/api/admin/agent-actions";
      const [mod, act, runList] = await Promise.all([
        adminApi.getJson<AgentModuleResponse>(
          `/api/admin/control-plane/modules/agents?environment=${encodeURIComponent(env)}`,
        ),
        adminApi.getJson<AgentAction[]>(actionsPath),
        adminApi.getJson<AgentRun[]>("/api/admin/agent-runs"),
      ]);
      setData(mod);
      setActions(act ?? []);
      setRuns(runList ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const decideAction = async (id: string, decision: "approve" | "reject" | "execute") => {
    setDeciding(id);
    setMsg(null);
    try {
      const body =
        decision === "reject" && rejectComment.trim() ? { comments: rejectComment.trim() } : {};
      const res = await adminApi.postJson<{ ok?: boolean; status?: string; executed?: boolean; reason?: string }>(
        `/api/admin/agent-actions/${id}/${decision}`,
        body,
      );
      if (decision === "execute") {
        setMsg(res.executed ? "Action executed." : `Execution blocked: ${res.reason ?? "gate or lease failed"}`);
      } else {
        setMsg(
          decision === "approve"
            ? res.status === "approved"
              ? "Approved — ready to execute."
              : "Approval recorded — more approvers required before execution."
            : "Rejected.",
        );
      }
      setRejectComment("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setDeciding(null);
    }
  };

  const toggleRunSteps = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (!runSteps[runId]) {
      try {
        const res = await adminApi.getJson<{ steps: AgentStep[] }>(
          `/api/admin/agent-runs?run_id=${encodeURIComponent(runId)}`,
        );
        setRunSteps((prev) => ({ ...prev, [runId]: res.steps ?? [] }));
      } catch {
        setRunSteps((prev) => ({ ...prev, [runId]: [] }));
      }
    }
  };

  const askCopilot = async () => {
    if (!copilotQ.trim()) return;
    setCopilotBusy(true);
    setCopilotResult(null);
    try {
      const res = await adminApi.postJson<{
        answer: string;
        deniedTools: string[];
        toolCalls: number;
        modelUsed?: string;
      }>("/api/admin/copilot", { question: copilotQ.trim() });
      setCopilotResult(res);
    } catch (e) {
      setCopilotResult({
        answer: e instanceof Error ? e.message : "Copilot failed",
        deniedTools: [],
        toolCalls: 0,
      });
    } finally {
      setCopilotBusy(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, env, statusFilter]);

  const saveModule = async (patch: Partial<{ master_enabled: boolean; shadow_mode: boolean }>) => {
    if (!data?.module) return;
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        master_enabled: patch.master_enabled ?? data.module.master_enabled,
        shadow_mode: patch.shadow_mode ?? data.module.shadow_mode,
      });
      setMsg("Saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAgentState = async (agentId: string, state: string) => {
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        agent_state: { agent_id: agentId, state },
      });
      setMsg("Agent state updated.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEmergency = async (patch: Partial<NonNullable<AgentModuleResponse["emergency"]>>) => {
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        emergency: { ...(data?.emergency ?? {}), ...patch },
      });
      setMsg("Emergency controls updated.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Agentic Console"
        description="Master switch, shadow mode, approvals inbox, live runs, and emergency controls."
      />
      <EnvSelect value={env} onChange={setEnv} />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Module controls</h2>
            <div className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(data?.module?.master_enabled)}
                  disabled={saving}
                  onChange={(e) => void saveModule({ master_enabled: e.target.checked })}
                />
                Master enabled (default OFF)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data?.module?.shadow_mode !== false}
                  disabled={saving}
                  onChange={(e) => void saveModule({ shadow_mode: e.target.checked })}
                />
                Shadow mode (no side effects)
              </label>
            </div>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Agents</h2>
            <ul className="text-sm space-y-2">
              {(data?.agents ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                  <span>
                    {a.display_name} <span className="text-gray-400">({a.key})</span>
                    <span className="ml-2 text-gray-500">role {a.admin_role} · risk ceiling {a.risk_ceiling}</span>
                  </span>
                  <select
                    className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                    value={a.agent_operational_state?.state ?? "disabled"}
                    disabled={saving}
                    onChange={(e) => void saveAgentState(a.id, e.target.value)}
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="draining">draining</option>
                    <option value="disabled">disabled</option>
                  </select>
                </li>
              ))}
            </ul>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Emergency kill switches</h2>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ["stop_new_runs", "Stop new runs"],
                  ["stop_all_tool_calls", "Stop all tool calls"],
                  ["block_approved_execution", "Block approved execution"],
                  ["freeze_pending_proposals", "Freeze pending proposals"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(data?.emergency?.[key])}
                    disabled={saving}
                    onChange={(e) => void saveEmergency({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </AdminPanel>
          <AdminPanel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">Approvals inbox</h2>
              <select
                className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="proposed">Proposed</option>
                <option value="approval_pending">Approval pending</option>
                <option value="approved">Approved (ready to execute)</option>
                <option value="executing">Executing</option>
                <option value="executed">Executed</option>
                <option value="rejected">Rejected</option>
                <option value="retryable_failure">Retryable failure</option>
                <option value="permanent_failure">Permanent failure</option>
              </select>
            </div>
            <ul className="text-sm space-y-2 max-h-[32rem] overflow-auto">
              {actions.slice(0, 50).map((a) => {
                const expiry = expiryLabel(a.approval_expires_at);
                const isExpanded = expandedAction === a.id;
                const canDecide = ACTIONABLE_STATUSES.has(a.status) && !expiry.expired;
                const canExecute = a.status === "approved" && !expiry.expired;
                return (
                  <li key={a.id} className="rounded-lg border border-gray-100 p-2">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-2 text-left"
                      onClick={() => setExpandedAction(isExpanded ? null : a.id)}
                    >
                      <span className="font-medium">{a.action_type}</span>
                      {riskBadge(a.risk_level)}
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{a.status}</span>
                      <span className="text-gray-500">
                        {a.target_type}/{a.target_id.slice(0, 8)}…
                      </span>
                      <span className={`ml-auto text-xs ${expiry.expired ? "text-red-600" : "text-gray-400"}`}>
                        {ACTIONABLE_STATUSES.has(a.status) || a.status === "approved" ? expiry.text : ""}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                        {a.reasoning_summary ? (
                          <p className="text-gray-700">
                            <span className="font-medium">Agent reasoning:</span> {a.reasoning_summary}
                          </p>
                        ) : null}
                        <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs">
                          {JSON.stringify(a.proposed_payload, null, 2)}
                        </pre>
                        {a.last_execution_error ? (
                          <p className="text-xs text-red-600">Last execution error: {a.last_execution_error}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          {canDecide ? (
                            <>
                              <button
                                type="button"
                                disabled={deciding === a.id}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void decideAction(a.id, "approve")}
                              >
                                Approve
                              </button>
                              <input
                                className="w-48 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                                placeholder="Reject reason (optional)"
                                value={rejectComment}
                                onChange={(e) => setRejectComment(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={deciding === a.id}
                                className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void decideAction(a.id, "reject")}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {canExecute ? (
                            <button
                              type="button"
                              disabled={deciding === a.id}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                              onClick={() => void decideAction(a.id, "execute")}
                            >
                              Execute now
                            </button>
                          ) : null}
                          {expiry.expired && (ACTIONABLE_STATUSES.has(a.status) || a.status === "approved") ? (
                            <span className="text-xs text-red-600">
                              Approval window expired — the agent must re-propose.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {actions.length === 0 ? <li className="text-gray-500">No agent actions</li> : null}
            </ul>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Live runs</h2>
            <ul className="text-sm space-y-2 max-h-64 overflow-auto">
              {runs.slice(0, 25).map((r) => (
                <li key={r.id} className="rounded-lg border border-gray-100 p-2">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-2 text-left"
                    onClick={() => void toggleRunSteps(r.id)}
                  >
                    <span className="font-medium">{r.workflow_type}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        r.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : r.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {r.trigger_kind}
                      {r.shadow_mode ? " · shadow" : ""}
                      {r.escalation_count > 0 ? ` · ${r.escalation_count} escalation(s)` : ""}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">
                      {new Date(r.started_at).toLocaleString()}
                    </span>
                  </button>
                  {expandedRun === r.id ? (
                    <div className="mt-2 border-t border-gray-100 pt-2 text-xs">
                      {r.error_class ? <p className="text-red-600">Error: {r.error_class}</p> : null}
                      {(runSteps[r.id] ?? []).length === 0 ? (
                        <p className="text-gray-500">No recorded steps for this run.</p>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="pr-2">#</th>
                              <th className="pr-2">Kind</th>
                              <th className="pr-2">Tool / model</th>
                              <th className="pr-2">Tokens</th>
                              <th className="pr-2">Cost</th>
                              <th>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(runSteps[r.id] ?? []).map((s) => (
                              <tr key={s.id} className="border-t border-gray-50">
                                <td className="pr-2">{s.seq}</td>
                                <td className="pr-2">{s.kind}</td>
                                <td className="pr-2">{s.tool_name ?? s.model_id ?? "—"}</td>
                                <td className="pr-2">
                                  {s.tokens_in}/{s.tokens_out}
                                </td>
                                <td className="pr-2">${Number(s.cost_usd).toFixed(4)}</td>
                                <td className={s.error || s.policy_denied ? "text-red-600" : "text-emerald-700"}>
                                  {s.policy_denied ? "policy denied" : (s.error ?? "ok")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
              {runs.length === 0 ? <li className="text-gray-500">No runs yet</li> : null}
            </ul>
          </AdminPanel>
          <AdminPanel>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Ask Copilot (read-only)</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="e.g. What is the status of ticket 6f2a…? Is the platform healthy?"
                value={copilotQ}
                onChange={(e) => setCopilotQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void askCopilot();
                }}
              />
              <button
                type="button"
                disabled={copilotBusy || !copilotQ.trim()}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void askCopilot()}
              >
                {copilotBusy ? "Asking…" : "Ask"}
              </button>
            </div>
            {copilotResult ? (
              <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                <p className="whitespace-pre-wrap text-gray-800">{copilotResult.answer}</p>
                <p className="text-xs text-gray-400">
                  {copilotResult.toolCalls} tool call(s)
                  {copilotResult.modelUsed ? ` · ${copilotResult.modelUsed}` : ""}
                  {copilotResult.deniedTools.length > 0
                    ? ` · denied: ${copilotResult.deniedTools.join(", ")}`
                    : ""}
                </p>
              </div>
            ) : null}
          </AdminPanel>
        </>
      )}
    </div>
  );
}
