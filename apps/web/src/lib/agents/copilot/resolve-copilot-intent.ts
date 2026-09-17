import type {
  CopilotDisambiguationOption,
  CopilotEntityType,
  CopilotInput,
  CopilotResolvedEntities,
} from "./copilot-types";
import { runAdminGlobalSearch, type AdminSearchKind } from "@/lib/admin/global-search";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canonicalizeEntityRef, isUuid } from "./canonicalize-entity";

export type CopilotIntent =
  | "provider.health"
  | "provider.earnings"
  | "provider.profile"
  | "provider.onboarding"
  | "provider.tickets"
  | "provider.risk"
  | "user.profile"
  | "user.spend"
  | "user.bookings"
  | "user.tickets"
  | "user.risk"
  | "booking.status"
  | "ticket.summary"
  | "ops.health"
  | "report.deeplink"
  | "unknown";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s-]{6,}\d)/;
const BTN_RE = /BTN[-\w]*/i;

const PRONOUN_RE =
  /\b(they|them|their|this one|this provider|this customer|this client|this user|this salon|this booking|this ticket)\b/i;
const THIS_ENTITY_RE = /\bthis (provider|customer|client|user|salon|booking|ticket)\b/i;

export type ResolveCopilotResult =
  | {
      status: "ready";
      intent: CopilotIntent;
      resolvedEntities: CopilotResolvedEntities;
      primaryEntity?: { key: string; entityType: CopilotEntityType; entityId: string };
    }
  | {
      status: "disambiguation";
      prompt: string;
      options: CopilotDisambiguationOption[];
      resolvedEntities: CopilotResolvedEntities;
    }
  | {
      status: "not_found";
      message: string;
      resolvedEntities: CopilotResolvedEntities;
    };

function mergeResolved(
  base: CopilotResolvedEntities | undefined,
  patch: CopilotResolvedEntities,
): CopilotResolvedEntities {
  return { ...(base ?? {}), ...patch };
}

function inferIntent(question: string, entityType?: CopilotEntityType): CopilotIntent {
  const q = question.toLowerCase();
  if (/platform|system health|is the platform|ops health|service down/.test(q)) return "ops.health";
  if (/report|breakdown|trend|compare|analytics/.test(q)) return "report.deeplink";

  if (entityType === "support_ticket" || (/\bticket\b/.test(q) && /summarize|summary|status/.test(q))) {
    return "ticket.summary";
  }
  if (entityType === "booking" || BTN_RE.test(question) || /\bbooking\b|\bappointment\b/.test(q)) {
    if (/status|when|who|how much/.test(q)) return "booking.status";
  }

  if (entityType === "user" || /\bcustomer\b|\bclient\b|\bmember\b|\bguest\b/.test(q)) {
    if (/spent|spend|wallet|loyalty|how much/.test(q)) return "user.spend";
    if (/booking|appointment|last visit/.test(q)) return "user.bookings";
    if (/ticket|support/.test(q)) return "user.tickets";
    if (/fraud|dispute|report|risk|trust/.test(q)) return "user.risk";
    return "user.profile";
  }

  if (entityType === "provider" || /\bprovider\b|\bsalon\b|\bspa\b|\bshop\b|\bmerchant\b|\bvendor\b/.test(q)) {
    if (/how much|earn|earned|revenue|gmv|payout|hold|made this month/.test(q)) return "provider.earnings";
    if (/onboard|activation|stuck|blocker/.test(q)) return "provider.onboarding";
    if (/ticket|support/.test(q)) return "provider.tickets";
    if (/fraud|dispute|risk|hold/.test(q)) return "provider.risk";
    if (/verified|yoco|terminal|owner|status|connect/.test(q)) return "provider.profile";
    return "provider.health";
  }

  if (/how much|earn|earned|revenue|payout/.test(q)) return "provider.earnings";
  if (/how is/.test(q)) {
    if (/\bcustomer\b|\bclient\b|\buser\b/.test(q)) return "user.profile";
    return "provider.health";
  }
  return "unknown";
}

function entityKeyForType(t: CopilotEntityType): string {
  if (t === "support_ticket") return "ticket";
  return t;
}

function wantsDifferentEntity(question: string): boolean {
  return /\bcompare\b|\bwhat about\b|\bhow about\b|\bother\b|\banother\b/.test(question.toLowerCase());
}

function extractSearchPhrase(question: string): string | null {
  let q = question.trim();
  q = q.replace(UUID_RE, " ").replace(EMAIL_RE, " ").replace(PHONE_RE, " ").replace(BTN_RE, " ");
  q = q.replace(/["']/g, " ");
  const stop =
    /\b(how|is|are|the|this|that|what|when|where|who|much|many|has|have|did|does|do|any|open|their|they|them|provider|customer|client|user|salon|spa|booking|ticket|about|for|a|an|and|or|of|in|on|at|to|from|with|show|me|tell|give|please|can|you|i|we|my|our|earned|earn|revenue|payout|hold|verified|yoco|status|doing|spent|spend|wallet|loyalty|fraud|dispute|report|trend|last|month|week|today)\b/gi;
  q = q.replace(stop, " ").replace(/\s+/g, " ").trim();
  if (q.length >= 2) return q;
  const email = EMAIL_RE.exec(question)?.[0];
  if (email) return email;
  const phone = PHONE_RE.exec(question)?.[0]?.replace(/\s+/g, "");
  if (phone && phone.replace(/\D/g, "").length >= 7) return phone;
  const btn = BTN_RE.exec(question)?.[0];
  if (btn) return btn;
  return null;
}

function searchKindsForQuestion(question: string): AdminSearchKind[] | undefined {
  if (BTN_RE.test(question)) return ["booking"];
  if (EMAIL_RE.test(question) || PHONE_RE.test(question)) return undefined;
  const q = question.toLowerCase();
  if (/\bcustomer\b|\bclient\b|\buser\b|\bmember\b/.test(q)) return ["user"];
  if (/\bprovider\b|\bsalon\b|\bspa\b/.test(q)) return ["provider"];
  return undefined;
}

function flattenSearchMatches(
  results: Awaited<ReturnType<typeof runAdminGlobalSearch>>,
): CopilotDisambiguationOption[] {
  const out: CopilotDisambiguationOption[] = [];
  for (const u of results.users) {
    out.push({
      entityType: "user",
      entityId: u.id,
      label: u.full_name || u.email || u.id,
      subtitle: u.email ?? u.phone ?? u.role ?? undefined,
    });
  }
  for (const p of results.providers) {
    out.push({
      entityType: "provider",
      entityId: p.id,
      label: p.business_name || p.owner_name || p.id,
      subtitle: p.status ?? undefined,
    });
  }
  for (const b of results.bookings) {
    out.push({
      entityType: "booking",
      entityId: b.id,
      label: b.booking_number || b.id,
      subtitle: [b.status, b.customer_name, b.provider_name].filter(Boolean).join(" · ") || undefined,
    });
  }
  return out;
}

export async function resolveCopilotQuestion(input: CopilotInput): Promise<ResolveCopilotResult> {
  let resolved = mergeResolved(input.resolvedEntities, {});

  const bind = (key: string, entityType: CopilotEntityType, entityId: string, label?: string) => {
    resolved = mergeResolved(resolved, {
      [key]: { entityType, entityId, label },
    });
  };

  if (input.selectedEntity) {
    const canon = await canonicalizeEntityRef(
      input.tenantId,
      input.selectedEntity.entityType,
      input.selectedEntity.entityId,
    );
    if (canon) {
      const key = entityKeyForType(input.selectedEntity.entityType);
      bind(key, input.selectedEntity.entityType, canon.entityId, input.selectedEntity.label ?? canon.label);
    }
  }

  const question = input.question;
  const usesPronoun = PRONOUN_RE.test(question) || THIS_ENTITY_RE.test(question);

  if (input.pageContext && !wantsDifferentEntity(question)) {
    if (!usesPronoun || !Object.keys(resolved).length) {
      const canon = await canonicalizeEntityRef(
        input.tenantId,
        input.pageContext.entityType,
        input.pageContext.entityId,
      );
      if (canon) {
        const key = entityKeyForType(input.pageContext.entityType);
        bind(key, input.pageContext.entityType, canon.entityId, input.pageContext.label ?? canon.label);
      }
    }
  }

  if (usesPronoun && input.pageContext) {
    const key = entityKeyForType(input.pageContext.entityType);
    if (!resolved[key]) {
      const canon = await canonicalizeEntityRef(
        input.tenantId,
        input.pageContext.entityType,
        input.pageContext.entityId,
      );
      if (canon) bind(key, input.pageContext.entityType, canon.entityId, input.pageContext.label ?? canon.label);
    }
  }

  const uuidInQ = UUID_RE.exec(question)?.[0];
  if (uuidInQ && isUuid(uuidInQ)) {
    const q = question.toLowerCase();
    if (q.includes("ticket")) bind("ticket", "support_ticket", uuidInQ);
    else if (q.includes("payout")) bind("payout", "payout", uuidInQ);
    else if (q.includes("refund")) bind("refund", "refund", uuidInQ);
    else if (q.includes("fraud")) bind("fraud_case", "fraud_case", uuidInQ);
    else if (q.includes("report")) bind("content_report", "content_report", uuidInQ);
    else if (q.includes("booking")) bind("booking", "booking", uuidInQ);
    else if (q.includes("provider")) bind("provider", "provider", uuidInQ);
    else if (q.includes("user") || q.includes("customer")) bind("user", "user", uuidInQ);
  }

  const hasPrimary =
    resolved.provider || resolved.user || resolved.booking || resolved.ticket || input.pageContext;

  if (!hasPrimary || wantsDifferentEntity(question)) {
    const phrase = extractSearchPhrase(question);
    if (phrase && phrase.length >= 2) {
      const admin = getSupabaseAdmin();
      const kinds = searchKindsForQuestion(question);
      const results = await runAdminGlobalSearch(admin, input.tenantId, phrase, kinds);
      const options = flattenSearchMatches(results).slice(0, 5);
      if (options.length === 0) {
        return {
          status: "not_found",
          message: `I couldn't find anyone or anything matching "${phrase}" in this tenant.`,
          resolvedEntities: resolved,
        };
      }
      if (options.length >= 2) {
        return {
          status: "disambiguation",
          prompt: `Which one did you mean?`,
          options,
          resolvedEntities: resolved,
        };
      }
      const only = options[0]!;
      const key = entityKeyForType(only.entityType);
      bind(key, only.entityType, only.entityId, only.label);
    }
  }

  const primary =
    resolved.provider ??
    resolved.user ??
    resolved.booking ??
    resolved.ticket ??
    (input.pageContext
      ? {
          entityType: input.pageContext.entityType,
          entityId: input.pageContext.entityId,
          label: input.pageContext.label,
        }
      : undefined);

  const entityType = primary?.entityType;
  const intent = inferIntent(question, entityType);

  if (intent === "unknown" && !primary) {
    return {
      status: "not_found",
      message:
        "I need a provider, customer, or booking to look up. Try a name, email, phone, or open a detail page and ask again.",
      resolvedEntities: resolved,
    };
  }

  const primaryKey = primary ? entityKeyForType(primary.entityType as CopilotEntityType) : undefined;

  return {
    status: "ready",
    intent,
    resolvedEntities: resolved,
    primaryEntity: primaryKey
      ? {
          key: primaryKey,
          entityType: primary.entityType as CopilotEntityType,
          entityId: primary.entityId,
        }
      : undefined,
  };
}
