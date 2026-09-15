/** Platform AI runtime/catalog is always stored on the global row (tenant_id IS NULL). */
export const AI_PLATFORM_SCOPE = "global" as const;

export function aiPlatformQuery(env: string): string {
  return `/api/admin/control-plane/integrations/ai?environment=${encodeURIComponent(env)}&scope=${AI_PLATFORM_SCOPE}`;
}

export function withAiPlatformScope(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, scope: AI_PLATFORM_SCOPE };
}
