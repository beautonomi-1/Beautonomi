import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, EnvSelect } from "../cpShared";
import { StickySaveBar } from "./StickySaveBar";
import { TAB_LABELS } from "./constants";
import type { AiPlatformTab, SelectableModel } from "./types";
import { useAiPlatformState } from "./useAiPlatformState";
import {
  FirstVisitSetupWizard,
  isWizardDismissed,
  shouldShowSetupWizard,
  wizardDismissKey,
} from "./FirstVisitSetupWizard";
import { OverviewTab } from "./tabs/OverviewTab";
import { GatewayTab } from "./tabs/GatewayTab";
import { WorkforceTab } from "./tabs/WorkforceTab";
import { BudgetsTab } from "./tabs/BudgetsTab";
import { SafetyTab } from "./tabs/SafetyTab";

export function AiPlatformHub() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [tab, setTab] = useState<AiPlatformTab>("overview");
  const [showWizard, setShowWizard] = useState(false);
  const s = useAiPlatformState(allowed);

  useEffect(() => {
    if (!s.data || s.loading) return;
    setShowWizard(shouldShowSetupWizard(s.data, s.env));
  }, [s.data, s.loading, s.env]);

  const dismissWizard = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(wizardDismissKey(s.env), "1");
    }
    setShowWizard(false);
  };

  if (denied) return denied;

  const selectableModels: SelectableModel[] = [
    ...(s.data?.direct_gemini_models ?? [])
      .filter((m) => m.enabled)
      .map((m) => ({ model_id: m.id, provider: m.provider, tier: m.tier, gateway: m.gateway })),
    ...(s.data?.selectable_models ?? []),
  ];

  return (
    <div className="space-y-6 pb-16">
      <CpBack to=".." label="Integrations" />
      <AdminPageHeader
        title="AI Platform"
        description="Vercel AI Gateway, agent workforce, budgets, and emergency controls — one hub."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnvSelect value={s.env} onChange={s.setEnv} />
        <Link to={adminSpaTo("/admin/control-plane/modules/agents")} className="text-sm text-blue-700 underline">
          Agentic Console →
        </Link>
      </div>

      {s.msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{s.msg}</p>
        </AdminPanel>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as AiPlatformTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-t-lg px-4 py-2 text-sm ${tab === t ? "border border-b-white border-gray-200 bg-white font-medium" : "text-gray-600 hover:text-gray-900"}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {s.loading || !s.data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {tab === "overview" ? (
            <OverviewTab
              env={s.env}
              data={s.data}
              saving={s.saving}
              onApplyPreset={s.applyPreset}
              onTestGateway={() => void s.testCall("gateway")}
            />
          ) : null}
          {tab === "gateway" ? (
            <GatewayTab
              env={s.env}
              data={s.data}
              runtime={s.runtime}
              setRuntime={s.setRuntime}
              defaultModelId={s.defaultModelId}
              setDefaultModelId={s.setDefaultModelId}
              failoverEnabled={s.failoverEnabled}
              setFailoverEnabled={s.setFailoverEnabled}
              runtimeEnabled={s.runtimeEnabled}
              setRuntimeEnabled={s.setRuntimeEnabled}
              gatewayKey={s.gatewayKey}
              setGatewayKey={s.setGatewayKey}
              openaiKey={s.openaiKey}
              setOpenaiKey={s.setOpenaiKey}
              anthropicKey={s.anthropicKey}
              setAnthropicKey={s.setAnthropicKey}
              geminiKey={s.geminiKey}
              setGeminiKey={s.setGeminiKey}
              onApplyPreset={s.applyPreset}
              onTest={s.testCall}
              onToggleCatalog={s.toggleCatalog}
              onMarkEval={s.markEvalPassed}
              onToggleDirectGemini={s.toggleDirectGemini}
              onRefreshCatalog={s.refreshCatalog}
              saving={s.saving}
            />
          ) : null}
          {tab === "workforce" ? (
            <WorkforceTab
              data={s.data}
              selectableModels={selectableModels}
              routingPolicyJson={s.routingPolicyJson}
              setRoutingPolicyJson={s.setRoutingPolicyJson}
              agentDailyCapUsd={s.agentDailyCapUsd}
              setAgentDailyCapUsd={s.setAgentDailyCapUsd}
              onSaveModule={s.saveAgentModule}
              onSaveBrain={s.saveAgentBrain}
              onSaveState={s.saveAgentState}
              saving={s.saving}
            />
          ) : null}
          {tab === "budgets" ? (
            <BudgetsTab
              data={s.data}
              monthlyBudgetUsd={s.monthlyBudgetUsd}
              setMonthlyBudgetUsd={s.setMonthlyBudgetUsd}
              dailyBudgetCredits={s.dailyBudgetCredits}
              setDailyBudgetCredits={s.setDailyBudgetCredits}
              alertThresholdPct={s.alertThresholdPct}
              setAlertThresholdPct={s.setAlertThresholdPct}
            />
          ) : null}
          {tab === "safety" ? (
            <SafetyTab
              env={s.env}
              data={s.data}
              runtime={s.runtime}
              safety={s.safety}
              setSafety={s.setSafety}
              advancedSafetyJson={s.advancedSafetyJson}
              setAdvancedSafetyJson={s.setAdvancedSafetyJson}
              showAdvancedSafety={s.showAdvancedSafety}
              setShowAdvancedSafety={s.setShowAdvancedSafety}
              onReload={s.load}
              onSaveAgentEmergency={(patch) =>
                void s.saveAgentModule({
                  emergency: { ...s.data!.workforce.emergency, ...patch },
                })
              }
              saving={s.saving}
            />
          ) : null}
        </>
      )}

      <StickySaveBar dirty={s.dirty} saving={s.saving} onSave={() => void s.saveSettings()} />

      {showWizard && s.data && !isWizardDismissed(s.env) ? (
        <FirstVisitSetupWizard
          env={s.env}
          data={s.data}
          gatewayKey={s.gatewayKey}
          setGatewayKey={s.setGatewayKey}
          monthlyBudgetUsd={s.monthlyBudgetUsd}
          setMonthlyBudgetUsd={s.setMonthlyBudgetUsd}
          onSaveGatewayKey={() => s.saveGatewayKeyOnly()}
          onTestGateway={() => s.testCall("gateway")}
          onApplyPreset={(preset) => s.applyPreset(preset)}
          onSaveBudget={() => s.saveMonthlyBudgetOnly()}
          onEnableWorkforce={() => s.enableStarterWorkforce()}
          onDismiss={dismissWizard}
          saving={s.saving}
          msg={s.msg}
        />
      ) : null}
    </div>
  );
}
