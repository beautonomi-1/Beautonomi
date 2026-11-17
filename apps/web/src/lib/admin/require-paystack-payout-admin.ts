import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

/**
 * F2-72: Paystack transfer / split / recipient routes go through the same
 * admin finance section + MFA / session-age path as other money mutations.
 */
export async function requirePaystackPayoutAdmin(request: Request): Promise<
  | { ok: true; user: { id: string; role: string } }
  | { ok: false; response: NextResponse }
> {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    return { ok: true, user: { id: user.id, role: String(user.role ?? "superadmin") } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = /authentication required/i.test(message) ? 401 : 403;
    return {
      ok: false,
      response: NextResponse.json(
        {
          data: null,
          error: {
            message,
            code: status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN",
          },
        },
        { status },
      ),
    };
  }
}
