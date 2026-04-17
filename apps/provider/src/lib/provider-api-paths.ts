/**
 * Stable URL builders for provider-app API calls. All requests use Bearer auth via `@/lib/api-client`.
 *
 * - **Provider AI:** `apps/web/src/app/api/provider/ai/[feature_key]/route.ts` — POST body `{ input?: string }`.
 */
export function apiProviderAiFeaturePath(featureKey: string): string {
  return `/api/provider/ai/${encodeURIComponent(featureKey)}`;
}
