import type { NextRequest } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";

/** Commercial-section gate for terminal merchant onboarding admin routes. */
export async function requireTerminalMerchantAdmin(request: NextRequest) {
  return requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
}
