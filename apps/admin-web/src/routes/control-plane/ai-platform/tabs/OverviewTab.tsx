import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AiSetupChecklist, buildSetupChecks } from "../AiSetupChecklist";
import type { AiPlatformPayload } from "../types";

export function OverviewTab(props: {
  env: string;
  data: AiPlatformPayload;
  onApplyPreset: (preset: string) => void;
  onTestGateway: () => void;
  saving: boolean;
}) {
  const { data, env } = props;
  const stats = data.stats;
  const wf = data.workforce;
  const checks = buildSetupChecks(data, env);
  const runtime = String(data.runtime?.runtime ?? "—");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="Runtime" value={runtime} variant="slate" />
        <AdminMetricCard label="Models enabled" value={stats?.models_enabled ?? 0} variant="emerald" />
        <AdminMetricCard label="Active agents" value={wf.gate_status.active_agents} variant="emerald" />
        <AdminMetricCard
          label="Spend today"
          value={`$${(stats?.spend_today_usd ?? 0).toFixed(4)}`}
          variant="amber"
        />
        <AdminMetricCard
          label="Spend month"
          value={`$${(wf.spend.platform_month_usd ?? 0).toFixed(2)}`}
          variant="amber"
        />
        <AdminMetricCard label="Failed (1h)" value={stats?.failed_calls_last_hour ?? 0} variant="rose" />
        <AdminMetricCard label="Pending approvals" value={wf.gate_status.pending_approvals} variant="slate" />
      </div>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Vercel-first setup checklist</h3>
        <p className="mb-3 text-xs text-gray-500">
          Models are loaded live from{" "}
          <a href="https://vercel.com/docs/ai-gateway" className="text-blue-700 underline" target="_blank" rel="noreferrer">
            Vercel AI Gateway
          </a>
          . Admin only stores enable flags, tiers, and eval gates.
        </p>
        <AiSetupChecklist checks={checks} />
        {wf.gate_status.missing_agent_keys.length > 0 ? (
          <p className="mt-3 text-xs text-amber-800">
            Missing agent definitions (apply migration 907): {wf.gate_status.missing_agent_keys.join(", ")}
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Preflight gates</h3>
        <ul className="space-y-1 text-sm">
          {wf.gate_status.gates.map((g) => (
            <li key={g.key} className="flex flex-wrap items-start gap-2">
              <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${g.ok ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="font-medium">{g.label}</span>
              <span className="text-gray-500">— {g.reason}</span>
            </li>
          ))}
        </ul>
        {wf.gate_status.blockers.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-900">
            {wf.gate_status.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            disabled={props.saving}
            onClick={() => props.onApplyPreset("gateway_cheap_global")}
          >
            Apply cheap global preset
          </button>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={props.onTestGateway}>
            Test Gateway
          </button>
          <Link
            to={adminSpaTo("/admin/control-plane/modules/agents")}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Open Agentic Console
          </Link>
          <span className="rounded-lg border px-3 py-1.5 text-sm text-gray-500" title="See docs/AGENT_ENABLEMENT_RUNBOOK.md in repo">
            Enablement runbook (docs/)
          </span>
        </div>
      </AdminPanel>
    </div>
  );
}
