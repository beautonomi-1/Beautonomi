/** Nav-desk label for Knowledge Base–aware Copilot queries (not an entity page context). */
export function deskFromAdminPath(pathname: string): string | undefined {
  const p = pathname.replace(/^\/admin/, "") || pathname;
  if (p.startsWith("/brand")) return "brand desk";
  if (p.startsWith("/grc")) return "GRC";
  if (p.startsWith("/payroll-rules") || p.startsWith("/finance") || p.startsWith("/payouts") || p.startsWith("/refunds")) {
    return "finance";
  }
  if (p.startsWith("/trust-safety-ops") || p.startsWith("/user-blocks") || p.startsWith("/fraud-cases")) {
    return "trust and safety";
  }
  if (p.startsWith("/provider-ops")) return "provider ops";
  if (p.startsWith("/commercial")) return "commercial operations";
  if (p.startsWith("/integrations") || p.startsWith("/webhooks") || p.startsWith("/api-keys")) {
    return "integrations";
  }
  if (p.startsWith("/marketing") || p.startsWith("/broadcast") || p.startsWith("/promotions")) {
    return "marketing";
  }
  if (p.startsWith("/knowledge-base")) return "knowledge base";
  if (p.startsWith("/cron-runs") || p.startsWith("/workflow-runs") || p.startsWith("/system-health") || p.startsWith("/operations")) {
    return "platform operations";
  }
  return undefined;
}

const DESK_STARTERS: Record<string, string[]> = {
  "brand desk": [
    "How do I review a brand brief?",
    "How do I move a campaign on the board?",
    "Where do I export the brand pack?",
  ],
  GRC: [
    "Where do I upload GRC evidence?",
    "How do I close a finding?",
    "What is the people training register?",
  ],
  finance: ["How do I approve a payout?", "Where are payroll rule sets?", "How do I run wallet reconciliation?"],
  "trust and safety": ["How do I process a fraud case?", "Where are blocked users?", "How does the trust AI queue work?"],
  "provider ops": ["How do I activate a provider?", "Where is the retention queue?", "How do I use the provider ops board?"],
  "commercial operations": ["How do I review terminal onboarding?", "Where are terminal orders?"],
  integrations: ["Where do I configure Paystack?", "How do I set up webhooks?"],
  marketing: ["How do I send a broadcast?", "Where is the brand desk runbook?"],
  "knowledge base": ["What training paths are available?", "How do I complete a training path?"],
  "platform operations": ["Where is the security event log?", "How do I check system health?"],
};

export function copilotStartersForDesk(desk: string | undefined): string[] | null {
  if (!desk) return null;
  return DESK_STARTERS[desk] ?? null;
}
