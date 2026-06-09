import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Bust Next.js data cache for public provider discovery surfaces after
 * provider status changes, suspension, soft-delete, or compliance purge.
 */
export function invalidatePublicProviderCache(): void {
  try {
    revalidateTag("public-providers", "default");
    revalidateTag("public-home", "default");
    revalidatePath("/");
  } catch (err) {
    console.warn("Public provider cache invalidation failed:", err);
  }
}
