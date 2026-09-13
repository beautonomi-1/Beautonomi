/**
 * Safe shapes for admin AI config responses — secrets never returned.
 */
import { maskSecret } from "@/lib/orders/shipping-secrets";

export function toSafeAiRuntimeRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: row.id,
    environment: row.environment,
    tenant_id: row.tenant_id ?? null,
    enabled: Boolean(row.enabled),
    runtime: row.runtime ?? "direct_gemini",
    default_model_id: row.default_model_id ?? null,
    failover_enabled: row.failover_enabled ?? true,
    gateway_key_set: Boolean(row.gateway_api_key_secret),
    gateway_key_preview: maskSecret(String(row.gateway_api_key_secret ?? "")),
    openai_key_set: Boolean(row.openai_api_key_secret),
    openai_key_preview: maskSecret(String(row.openai_api_key_secret ?? "")),
    anthropic_key_set: Boolean(row.anthropic_api_key_secret),
    anthropic_key_preview: maskSecret(String(row.anthropic_api_key_secret ?? "")),
    gemini_key_set: Boolean(row.gemini_api_key_set),
    updated_at: row.updated_at,
  };
}

export function toSafeEmergencyRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    environment: row.environment,
    stop_all_calls: Boolean(row.stop_all_calls),
    force_template_fallback: Boolean(row.force_template_fallback),
    disable_streaming: Boolean(row.disable_streaming),
    disable_vision: Boolean(row.disable_vision),
    disable_embeddings: Boolean(row.disable_embeddings),
    activated_by: row.activated_by ?? null,
    activated_at: row.activated_at ?? null,
    reason: row.reason ?? null,
  };
}
