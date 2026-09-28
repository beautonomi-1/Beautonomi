/** Lightweight brief assist hooks — replace body with full copilot orchestration when wired. */

export type BriefAssistKind =
  | "tighten_proposition"
  | "suggest_reasons"
  | "suggest_deliverables"
  | "draft_from_idea";

export function runBriefCopilotAssist(input: {
  kind: BriefAssistKind;
  idea?: string;
  proposition?: string;
  channels?: string[];
  campaign_type?: string;
}): { text: string; ai_assisted: true } {
  switch (input.kind) {
    case "draft_from_idea":
      return {
        ai_assisted: true,
        text: `Objective: ${input.idea ?? "Launch campaign"}\nProposition: One clear benefit for the audience.\nInsight: What they believe today vs what we need them to believe.`,
      };
    case "tighten_proposition":
      return {
        ai_assisted: true,
        text: (input.proposition ?? "").split(".").filter(Boolean)[0]?.trim().slice(0, 120) ?? "",
      };
    case "suggest_reasons":
      return {
        ai_assisted: true,
        text: "Proof from product data; customer quotes; third-party stats; trial/redemption rate.",
      };
    case "suggest_deliverables":
      return {
        ai_assisted: true,
        text: (input.channels ?? [])
          .map((ch) => `- ${ch}: primary asset + cut-down for stories`)
          .join("\n"),
      };
    default:
      return { ai_assisted: true, text: "" };
  }
}
