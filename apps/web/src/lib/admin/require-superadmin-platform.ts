import type { NextRequest } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";

/**
 * Control-plane style routes that must be **superadmin-only** (not just platform_config section editors).
 */
export async function requireSuperadminPlatform(request: NextRequest) {
  const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
  if (user.role !== "superadmin") {
    return { user: null };
  }
  return { user };
}
