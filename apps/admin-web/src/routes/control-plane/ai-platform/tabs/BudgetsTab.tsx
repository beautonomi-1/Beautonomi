import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpField } from "../../cpShared";
import type { AiPlatformPayload } from "../types";

export function BudgetsTab(props: {
  data: AiPlatformPayload;
  monthlyBudgetUsd: number | "";
  setMonthlyBudgetUsd: (v: number | "") => void;
  dailyBudgetCredits: number;
  setDailyBudgetCredits: (v: number) => void;
  alertThresholdPct: number;
  setAlertThresholdPct: (v: number) => void;
}) {
  const wf = props.data.workforce.spend;
  const stats = props.data.stats;
  const monthlyCap = wf.monthly_budget_usd ?? stats?.monthly_budget_usd;
  const pctUsed =
    monthlyCap && monthlyCap > 0 ? Math.min(100, Math.round((wf.platform_month_usd / monthlyCap) * 100)) : null;

  return (
    <div className="space-y-4">
      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Platform spend (USD)</h3>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><span className="text-gray-500">Today</span><div className="font-medium">${wf.platform_today_usd.toFixed(4)}</div></div>
          <div><span className="text-gray-500">Month</span><div className="font-medium">${wf.platform_month_usd.toFixed(4)}</div></div>
          <div><span className="text-gray-500">Monthly cap</span><div className="font-medium">{monthlyCap ? `$${monthlyCap}` : "Not set"}</div></div>
        </div>
        {pctUsed != null ? (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${pctUsed}%` }} /></div>
            <p className="mt-1 text-xs text-gray-500">{pctUsed}% of monthly cap used</p>
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-2 text-sm font-semibold">Breakdown (month)</h3>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-gray-500 text-xs">Agent workforce</div>
            <div className="text-lg font-semibold">${wf.agent_month_usd.toFixed(4)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-gray-500 text-xs">Provider AI features</div>
            <div className="text-lg font-semibold">${wf.provider_ai_month_usd.toFixed(4)}</div>
          </div>
        </div>
        {wf.agent_daily_cap_usd ? (
          <p className="mt-2 text-xs text-gray-500">Agent daily cap: ${wf.agent_daily_cap_usd} (enforced via ai_usage_log)</p>
        ) : null}
      </AdminPanel>

      <AdminPanel className="space-y-3">
        <h3 className="text-sm font-semibold">Budget controls</h3>
        <p className="text-xs text-gray-500">Primary control is monthly USD on ai_usage_log. Daily credits are a legacy call-count throttle.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <CpField label="Monthly budget (USD) — primary">
            <input type="number" step="0.01" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.monthlyBudgetUsd} onChange={(e) => props.setMonthlyBudgetUsd(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)} />
          </CpField>
          <CpField label="Alert threshold (%)">
            <input type="number" min={1} max={100} className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.alertThresholdPct} onChange={(e) => props.setAlertThresholdPct(parseInt(e.target.value, 10) || 80)} />
          </CpField>
          <CpField label="Legacy daily credits (call count)">
            <input type="number" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.dailyBudgetCredits} onChange={(e) => props.setDailyBudgetCredits(parseInt(e.target.value, 10) || 0)} />
          </CpField>
        </div>
        <Link to={adminSpaTo("/admin/control-plane/modules/ai")} className="text-sm text-blue-700 underline">Provider AI templates & entitlements →</Link>
      </AdminPanel>
    </div>
  );
}
