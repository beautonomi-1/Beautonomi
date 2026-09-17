import { BOUND_TOOL_REGISTRY } from "@/lib/agents/tools/bound-registry";

export const COPILOT_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const COPILOT_EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export const COPILOT_PHONE_RE = /(?:\+?\d[\d\s-]{6,}\d)/;
export const COPILOT_BTN_RE = /BTN[-\w]*/i;

const META_HELP_RE =
  /\b(what (can|do) you|what are you|who are you|what tools|what access|have access|your capabilities|help me|how do i use|what can i ask)\b/i;

const WEAK_SEARCH_DENY = new Set([
  "access",
  "help",
  "tools",
  "tool",
  "capabilities",
  "capability",
  "copilot",
  "assistant",
  "ai",
  "status",
  "info",
  "information",
  "data",
  "everything",
  "anything",
  "something",
]);

export function isMetaOrHelpQuestion(question: string): boolean {
  const q = question.trim();
  if (META_HELP_RE.test(q)) return true;
  if (/^\s*(help|capabilities|what\s+can\s+you\s+do)\s*[?.!]*\s*$/i.test(q)) return true;
  return false;
}

export function hasHardLookupSignal(question: string): boolean {
  return (
    COPILOT_UUID_RE.test(question) ||
    COPILOT_EMAIL_RE.test(question) ||
    COPILOT_BTN_RE.test(question) ||
    (COPILOT_PHONE_RE.test(question) &&
      (COPILOT_PHONE_RE.exec(question)?.[0]?.replace(/\D/g, "").length ?? 0) >= 7)
  );
}

export function isWeakSearchPhrase(phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return true;
  if (WEAK_SEARCH_DENY.has(p)) return true;
  if (p.length < 3 && !hasHardLookupSignal(phrase)) return true;
  const words = p.split(/\s+/);
  if (words.length === 1 && WEAK_SEARCH_DENY.has(words[0]!)) return true;
  return false;
}

export type CopilotToolBriefLine = {
  name: string;
  description: string;
  requiredSection: string;
};

export function buildAllowedToolsBrief(allowedSections: string[]): CopilotToolBriefLine[] {
  const allowed = new Set(allowedSections);
  return BOUND_TOOL_REGISTRY.filter(
    (t) => t.mode === "read" && (allowedSections.length === 0 || allowed.has(t.requiredSection)),
  ).map((t) => ({
    name: t.name,
    description: t.description,
    requiredSection: t.requiredSection,
  }));
}

export function filterPlannerToolNames(allowedSections: string[]): Set<string> {
  return new Set(buildAllowedToolsBrief(allowedSections).map((t) => t.name));
}

export const DEFAULT_SUGGESTED_PROMPTS = [
  "What can you help me with?",
  "Find a provider by business name",
  "Look up a booking (BTN-…)",
  "How do I draft a support reply?",
];
