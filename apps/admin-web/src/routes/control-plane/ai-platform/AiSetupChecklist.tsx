import type { AiPlatformPayload } from "./types";

type Check = { id: string; label: string; ok: boolean; hint?: string };

export function buildSetupChecks(data: AiPlatformPayload | null, env: string): Check[] {
  if (!data) return [];
  const runtime = data.runtime ?? {};
  const wf = data.workforce;
  const enabledModels = (data.live_models ?? []).filter((m) => m.enabled).length;
  const gatewayKeySet = Boolean(runtime.gateway_key_set);
  const isGateway = String(runtime.runtime ?? "") === "vercel_gateway";
  const prodEvalOk =
    env !== "production" ||
    (data.live_models ?? []).filter((m) => m.enabled).every((m) => Boolean(m.eval_passed_at));

  return [
    { id: "gateway_key", label: "Vercel Gateway API key configured", ok: gatewayKeySet },
    { id: "runtime", label: "Runtime set to Vercel AI Gateway", ok: isGateway },
    { id: "models", label: "At least one model enabled", ok: enabledModels > 0 },
    {
      id: "eval",
      label: "Production eval gate passed for enabled models",
      ok: prodEvalOk,
      hint: env === "production" ? "Mark eval passed or disable models until tested" : undefined,
    },
    { id: "master", label: "Agent workforce master switch on", ok: wf.module.master_enabled },
    { id: "active", label: "At least one agent active", ok: wf.gate_status.active_agents > 0 },
  ];
}

export function AiSetupChecklist(props: { checks: Check[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {props.checks.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start gap-2">
          <span
            className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full ${c.ok ? "bg-emerald-500" : "bg-gray-300"}`}
          />
          <span className={c.ok ? "text-gray-800" : "text-gray-600"}>{c.label}</span>
          {!c.ok && c.hint ? <span className="basis-full pl-5 text-xs text-gray-500">{c.hint}</span> : null}
        </li>
      ))}
    </ul>
  );
}
