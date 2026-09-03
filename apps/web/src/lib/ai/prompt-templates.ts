/**
 * Runtime loader for admin-managed prompt templates (`ai_prompt_templates`,
 * migration 253; CRUD under Control Plane -> Modules -> AI -> Templates).
 *
 * Resolution: highest `version` row with `enabled = true` for the feature key,
 * cached in-process for 5 minutes. Callers fall back to `FEATURE_TEMPLATES`
 * when this returns null (no row, disabled, or empty template text).
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface ResolvedPromptTemplate {
  key: string;
  version: number;
  /** Goes into Gemini `system_instruction`. */
  system: string;
  /** Goes into the user turn. */
  userPrompt: string;
  /** Non-empty JSON schema object, or null when the row has none. */
  outputSchema: Record<string, unknown> | null;
  source: "db";
}

export const PROMPT_TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { value: ResolvedPromptTemplate | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function isNonEmptySchema(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0;
}

async function fetchTemplate(featureKey: string): Promise<ResolvedPromptTemplate | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ai_prompt_templates")
    .select("key, version, enabled, template, system_instructions, output_schema")
    .eq("key", featureKey)
    .eq("enabled", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as {
    key: string;
    version: number;
    template?: string | null;
    system_instructions?: string | null;
    output_schema?: unknown;
  };
  const system = (row.system_instructions ?? "").trim();
  const userPrompt = (row.template ?? "").trim();
  // A row with neither instruction nor template is a placeholder; treat as absent.
  if (!system && !userPrompt) return null;

  return {
    key: row.key,
    version: Number(row.version ?? 1),
    system,
    userPrompt,
    outputSchema: isNonEmptySchema(row.output_schema) ? row.output_schema : null,
    source: "db",
  };
}

/** Load the enabled template for a feature key (5-minute cache, negative results cached too). */
export async function loadPromptTemplate(featureKey: string): Promise<ResolvedPromptTemplate | null> {
  const now = Date.now();
  const hit = cache.get(featureKey);
  if (hit && hit.expiresAt > now) return hit.value;

  let value: ResolvedPromptTemplate | null = null;
  try {
    value = await fetchTemplate(featureKey);
  } catch {
    value = null;
  }
  cache.set(featureKey, { value, expiresAt: now + PROMPT_TEMPLATE_CACHE_TTL_MS });
  return value;
}

/** Test / admin hook: drop one key or the whole cache. */
export function clearPromptTemplateCache(featureKey?: string): void {
  if (featureKey) cache.delete(featureKey);
  else cache.clear();
}
