/**
 * Server-side i18n helpers for agent heuristic drafts (no React hooks).
 */
import { i18n, initI18n, isSupportedLanguageCode } from "@beautonomi/i18n";

const DEFAULT_NS = "common";
let ready = false;

function ensureI18n(): void {
  if (!ready) {
    initI18n("en");
    ready = true;
  }
}

export function resolveAgentLocale(preferredLanguage?: string | null): string {
  ensureI18n();
  const lang = (preferredLanguage ?? "en").trim().toLowerCase();
  return isSupportedLanguageCode(lang) ? lang : "en";
}

export function buildLocalizedFallbackReply(params: {
  locale?: string | null;
  customerName: string | null;
  ticketNumber: string;
  subject: string;
  needsHuman: boolean;
}): string {
  ensureI18n();
  const lng = resolveAgentLocale(params.locale);
  const greeting = params.customerName
    ? i18n.t("agent.support.greeting_named", {
        lng,
        ns: DEFAULT_NS,
        defaultValue: `Hi ${params.customerName},`,
        name: params.customerName,
      })
    : i18n.t("agent.support.greeting", { lng, ns: DEFAULT_NS, defaultValue: "Hi there," });
  const escalationLine = params.needsHuman
    ? i18n.t("agent.support.fallback_escalation", {
        lng,
        ns: DEFAULT_NS,
        defaultValue:
          "Because of the nature of your request, a member of our support team is personally reviewing it and will follow up with you shortly.",
      })
    : i18n.t("agent.support.fallback_standard", {
        lng,
        ns: DEFAULT_NS,
        defaultValue:
          "Our support team is looking into this and will get back to you as soon as possible.",
      });
  return i18n.t("agent.support.fallback_reply", {
    lng,
    ns: DEFAULT_NS,
    defaultValue: [
      greeting,
      "",
      `Thank you for contacting Beautonomi support about "${params.subject}" (ticket ${params.ticketNumber}).`,
      escalationLine,
      "",
      "If you have any additional details or screenshots that could help, just reply to this ticket.",
      "",
      "Warm regards,",
      "Beautonomi Support",
    ].join("\n"),
    greeting,
    subject: params.subject,
    ticketNumber: params.ticketNumber,
    escalationLine,
  });
}

export function buildLocalizedSupportNudge(params: {
  locale?: string | null;
  ticketNumber: string;
  daysSinceReply: number;
}): string {
  ensureI18n();
  const lng = resolveAgentLocale(params.locale);
  return i18n.t("agent.support.nudge", {
    lng,
    ns: DEFAULT_NS,
    defaultValue: [
      "Hi there,",
      "",
      `Just checking in on ticket ${params.ticketNumber} — we replied ${params.daysSinceReply} day(s) ago and want to make sure you saw it.`,
      "If our answer solved the problem, no action is needed. If you still need help, reply here and we'll pick it right back up.",
      "",
      "Warm regards,",
      "Beautonomi Support",
    ].join("\n"),
    ticketNumber: params.ticketNumber,
    daysSinceReply: params.daysSinceReply,
  });
}

export function buildLocalizedCsatRecovery(params: {
  locale?: string | null;
  ticketNumber: string;
  customerName: string | null;
}): string {
  ensureI18n();
  const lng = resolveAgentLocale(params.locale);
  const greeting = params.customerName
    ? i18n.t("agent.support.greeting_named", {
        lng,
        ns: DEFAULT_NS,
        defaultValue: `Hi ${params.customerName},`,
        name: params.customerName,
      })
    : i18n.t("agent.support.greeting", { lng, ns: DEFAULT_NS, defaultValue: "Hi there," });
  return i18n.t("agent.support.csat_recovery", {
    lng,
    ns: DEFAULT_NS,
    defaultValue: [
      greeting,
      "",
      `Thank you for your honest feedback on ticket ${params.ticketNumber}. I'm sorry the experience fell short.`,
      "A senior member of our support team is personally reviewing what happened.",
      "",
      "Warm regards,",
      "Beautonomi Support",
    ].join("\n"),
    ticketNumber: params.ticketNumber,
    greeting,
  });
}
