import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { DEFAULT_PHONE_COUNTRY_CODE, normalizePhoneToE164 } from "@beautonomi/phone";
import { phoneIlikeClauses, sanitizeIlikeTerm } from "@/lib/search/phone-ilike";

/**
 * GET /api/admin/users/search
 *
 * Search for a user by email or phone number
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return handleApiError(new Error("Supabase client not available"), "Failed to search user");
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Search query is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 },
      );
    }

    const searchTerm = query.trim();
    const e164 = normalizePhoneToE164(searchTerm, DEFAULT_PHONE_COUNTRY_CODE);

    if (e164) {
      const { data: byExactPhone, error: exactErr } = await supabase
        .from("users")
        .select("id, email, phone, full_name")
        .eq("phone", e164)
        .limit(1)
        .maybeSingle();

      if (exactErr) {
        console.error("Error searching user by exact phone:", exactErr);
        return handleApiError(exactErr, "Failed to search user");
      }

      if (byExactPhone) {
        return successResponse({
          id: byExactPhone.id,
          email: byExactPhone.email,
          phone: byExactPhone.phone,
          full_name: byExactPhone.full_name,
        });
      }
    }

    const safe = sanitizeIlikeTerm(searchTerm).trim();
    const orClauses = [
      ...(safe ? [`email.ilike.%${safe}%`, `phone.ilike.%${safe}%`] : []),
      ...phoneIlikeClauses(["phone"], searchTerm),
    ];

    const { data: users, error } = orClauses.length
      ? await supabase
          .from("users")
          .select("id, email, phone, full_name")
          .or(orClauses.join(","))
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (error) {
      console.error("Error searching user:", error);
      return handleApiError(error, "Failed to search user");
    }

    if (!users) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "User not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 },
      );
    }

    return successResponse({
      id: users.id,
      email: users.email,
      phone: users.phone,
      full_name: users.full_name,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search user");
  }
}
