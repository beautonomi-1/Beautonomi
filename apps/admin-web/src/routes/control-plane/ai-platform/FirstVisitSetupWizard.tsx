import { useMemo, useState } from "react";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { PRESET_HINTS } from "./constants";
import type { AiPlatformPayload } from "./types";

const WIZARD_DISMISS_KEY = "ai-platform-setup-wizard-dismissed";

type Step = "key" | "test" | "preset" | "budget" | "workforce" | "done";

export function wizardDismissKey(env: string): string {
  return `${WIZARD_DISMISS_KEY}:${env}`;
}

export function isWizardDismissed(env: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(wizardDismissKey(env)) === "1";
}

export function shouldShowSetupWizard(data: AiPlatformPayload | null, env: string): boolean {
  if (!data) return false;
  if (isWizardDismissed(env)) return false;
  return !Boolean(data.runtime?.gateway_key_set);
}

export function FirstVisitSetupWizard(props: {
  env: string;
  data: AiPlatformPayload;
  gatewayKey: string;
  setGatewayKey: (v: string) => void;
  monthlyBudgetUsd: number | "";
  setMonthlyBudgetUsd: (v: number | "") => void;
  onSaveGatewayKey: () => Promise<void>;
  onTestGateway: () => Promise<boolean>;
  onApplyPreset: (preset: string) => Promise<void>;
  onSaveBudget: () => Promise<void>;
  onEnableWorkforce: () => Promise<void>;
  onDismiss: () => void;
  saving: boolean;
  msg: string | null;
}) {
  const [step, setStep] = useState<Step>("key");
  const [testPassed, setTestPassed] = useState(false);
  const [presetConfirm, setPresetConfirm] = useState(false);

  const opsSentinel = props.data.workforce.agents.find((a) => a.key === "ops-sentinel");
  const supportTriage = props.data.workforce.agents.find((a) => a.key === "support-triage");

  const stepIndex = useMemo(() => {
    const order: Step[] = ["key", "test", "preset", "budget", "workforce", "done"];
    return order.indexOf(step);
  }, [step]);

  const runTest = async () => {
    const ok = await props.onTestGateway();
    if (ok) {
      setTestPassed(true);
      setStep("preset");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <AdminPanel className="max-w-lg w-full space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Set up Vercel AI Gateway</h2>
            <p className="mt-1 text-xs text-gray-500">
              Step {Math.min(stepIndex + 1, 5)} of 5 · {props.env}
            </p>
          </div>
          <button type="button" className="text-xs text-gray-500 underline" onClick={props.onDismiss}>
            Skip for now
          </button>
        </div>

        <ol className="flex gap-1">
          {(["key", "test", "preset", "budget", "workforce"] as Step[]).map((s, i) => (
            <li
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-emerald-500" : "bg-gray-200"}`}
            />
          ))}
        </ol>

        {props.msg ? <p className="text-sm text-gray-700">{props.msg}</p> : null}

        {step === "key" ? (
          <div className="space-y-3 text-sm">
            <p>Paste your Vercel AI Gateway API key. Models and routing come from the live Gateway catalog.</p>
            <input
              type="password"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Gateway API key"
              value={props.gatewayKey}
              onChange={(e) => props.setGatewayKey(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={props.saving || !props.gatewayKey.trim()}
              onClick={() =>
                void props.onSaveGatewayKey().then(() => setStep("test"))
              }
            >
              Save key & continue
            </button>
          </div>
        ) : null}

        {step === "test" ? (
          <div className="space-y-3 text-sm">
            <p>Probe the Gateway with your saved key before enabling models.</p>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              disabled={props.saving}
              onClick={() => void runTest()}
            >
              Test Gateway
            </button>
            {testPassed ? (
              <button type="button" className="text-sm text-blue-700 underline" onClick={() => setStep("preset")}>
                Continue →
              </button>
            ) : null}
          </div>
        ) : null}

        {step === "preset" ? (
          <div className="space-y-3 text-sm">
            <p>Apply the recommended cheap global preset (Vercel Gateway runtime + starter models).</p>
            <p className="text-xs text-gray-500">{PRESET_HINTS.gateway_cheap_global}</p>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={props.saving}
              onClick={() => setPresetConfirm(true)}
            >
              Apply gateway_cheap_global
            </button>
          </div>
        ) : null}

        {step === "budget" ? (
          <div className="space-y-3 text-sm">
            <p>Set a monthly USD cap for platform AI spend (recommended before enabling agents).</p>
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="e.g. 100"
              value={props.monthlyBudgetUsd}
              onChange={(e) =>
                props.setMonthlyBudgetUsd(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)
              }
            />
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={props.saving || props.monthlyBudgetUsd === ""}
              onClick={() =>
                void props.onSaveBudget().then(() => setStep("workforce"))
              }
            >
              Save budget & continue
            </button>
          </div>
        ) : null}

        {step === "workforce" ? (
          <div className="space-y-3 text-sm">
            <p>
              Turn on the agent workforce in shadow mode and activate <strong>Ops Sentinel</strong> and{" "}
              <strong>Support Triage</strong> for a safe first rollout.
            </p>
            <ul className="text-xs text-gray-600 list-disc pl-5">
              <li>Master enabled + shadow mode (proposals only)</li>
              <li>{opsSentinel?.display_name ?? "Ops Sentinel"} → active</li>
              <li>{supportTriage?.display_name ?? "Support Triage"} → active</li>
            </ul>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={props.saving || !opsSentinel?.id || !supportTriage?.id}
              onClick={() =>
                void props.onEnableWorkforce().then(() => setStep("done"))
              }
            >
              Enable workforce
            </button>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="space-y-3 text-sm">
            <p className="text-emerald-800 font-medium">Setup complete.</p>
            <p className="text-gray-600">
              Review the Overview checklist, then open Agentic Console after the first cron sweep for proposals.
            </p>
            <button type="button" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white" onClick={props.onDismiss}>
              Close wizard
            </button>
          </div>
        ) : null}

        <AdminConfirmDialog
          open={presetConfirm}
          onClose={() => setPresetConfirm(false)}
          title="Apply gateway_cheap_global?"
          consequence="Sets runtime to Vercel AI Gateway and enables starter models from the live catalog."
          preview={<p className="text-xs text-gray-500">{PRESET_HINTS.gateway_cheap_global}</p>}
          confirmLabel="Apply preset"
          busy={props.saving}
          onConfirm={() => {
            setPresetConfirm(false);
            void props.onApplyPreset("gateway_cheap_global").then(() => setStep("budget"));
          }}
        />
      </AdminPanel>
    </div>
  );
}
