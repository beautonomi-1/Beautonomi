import { runAdminGlobalSearch, type AdminSearchKind } from "@/lib/admin/global-search";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CopilotDisambiguationOption, CopilotEntityType, CopilotResolvedEntities } from "./copilot-types";
import { DEFAULT_SUGGESTED_PROMPTS, isWeakSearchPhrase } from "./copilot-capabilities";

function entityKeyForType(t: CopilotEntityType): string {
  if (t === "support_ticket") return "ticket";
  return t;
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

export type SearchBindResult =
  | { status: "bound"; resolvedEntities: CopilotResolvedEntities }
  | { status: "disambiguation"; prompt: string; options: CopilotDisambiguationOption[]; resolvedEntities: CopilotResolvedEntities }
  | { status: "clarify"; message: string; suggestedPrompts: string[]; resolvedEntities: CopilotResolvedEntities }
  | { status: "not_found"; message: string; resolvedEntities: CopilotResolvedEntities };

export async function bindEntityFromSearchQuery(params: {
  tenantId: string;
  query: string;
  resolvedEntities: CopilotResolvedEntities;
  kinds?: AdminSearchKind[];
}): Promise<SearchBindResult> {
  const q = params.query.trim();
  if (!q || isWeakSearchPhrase(q)) {
    return {
      status: "clarify",
      message: "Which provider, customer, or booking should I look up? Give me a name, email, phone, or BTN- ref.",
      suggestedPrompts: DEFAULT_SUGGESTED_PROMPTS,
      resolvedEntities: params.resolvedEntities,
    };
  }

  const admin = getSupabaseAdmin();
  const results = await runAdminGlobalSearch(admin, params.tenantId, q, params.kinds);
  const options = flattenSearchMatches(results).slice(0, 5);
  let resolved = { ...params.resolvedEntities };

  if (options.length === 0) {
    return {
      status: "not_found",
      message: `I couldn't find anyone or anything matching "${q}" in this tenant.`,
      resolvedEntities: resolved,
    };
  }
  if (options.length >= 2) {
    return {
      status: "disambiguation",
      prompt: "Which one did you mean?",
      options,
      resolvedEntities: resolved,
    };
  }

  const only = options[0]!;
  const key = entityKeyForType(only.entityType);
  resolved = {
    ...resolved,
    [key]: { entityType: only.entityType, entityId: only.entityId, label: only.label },
  };
  return { status: "bound", resolvedEntities: resolved };
}
