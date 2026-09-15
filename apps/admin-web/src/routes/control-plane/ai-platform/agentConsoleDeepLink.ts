import { adminSpaTo } from "@/lib/adminSpaPath";

export type AgentConsolePanel = "proposals" | "runs";

export function agentConsoleDeepLink(params: {
  agentId: string;
  panel: AgentConsolePanel;
  status?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set("agent_id", params.agentId);
  qs.set("panel", params.panel);
  if (params.panel === "proposals" && params.status) {
    qs.set("status", params.status);
  } else if (params.panel === "proposals" && !params.status) {
    qs.set("status", "proposed");
  }
  return `${adminSpaTo("/admin/control-plane/modules/agents")}?${qs.toString()}`;
}
