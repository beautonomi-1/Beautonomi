import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Bust Next.js data cache for public provider discovery surfaces after a
 * provider visibility transition (activation, suspension, soft-delete, purge).
 *
 * Pass `tenantId` to also invalidate the per-tenant cache tags so only the
 * affected tenant's feed is busted, avoiding a global stampede. The global
 * tags are always invalidated for backward compatibility and edge cases where
 * the tenantId is unavailable.
 */
export function invalidatePublicProviderCache(tenantId?: string | null): void {
  try {
    revalidateTag("public-providers", "default");
    revalidateTag("public-home", "default");
    if (tenantId) {
      revalidateTag(`public-providers-${tenantId}`, "default");
      revalidateTag(`public-home-${tenantId}`, "default");
    }
    revalidatePath("/");
  } catch (err) {
    console.warn("Public provider cache invalidation failed:", err);
  }
}
