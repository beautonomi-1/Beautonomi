import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

const DEFAULT_REFERRAL_SOURCES = [
  { name: "Google Search", description: "Client found you through Google" },
  { name: "Instagram", description: "Client found you through Instagram" },
  { name: "Facebook", description: "Client found you through Facebook" },
  { name: "TikTok", description: "Client found you through TikTok" },
  { name: "WhatsApp", description: "Client reached you through WhatsApp" },
  { name: "Client referral", description: "Referred by another client" },
  { name: "Walk-in", description: "Client walked in or contacted the salon directly" },
  { name: "Other", description: "Other source" },
] as const;

/**
 * GET /api/provider/referral-sources
 * Get all referral sources for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's sources
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    let query = supabase
      .from("referral_sources")
      .select("*")
      .order("name", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    let { data, error } = await query;

    if (error) {
      throw error;
    }

    if (providerId && (!data || data.length === 0)) {
      const admin = getSupabaseAdmin();
      const defaults = DEFAULT_REFERRAL_SOURCES.map((source) => ({
        provider_id: providerId,
        name: source.name,
        description: source.description,
        is_active: true,
      }));
      const { data: created, error: seedError } = await admin
        .from("referral_sources")
        .insert(defaults)
        .select("*")
        .order("name", { ascending: true });
      if (!seedError && created) {
        data = created;
      }
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to load referral sources");
  }
}

/**
 * POST /api/provider/referral-sources
 * Create a new referral source
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = createSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const insertData: any = {
      provider_id: providerId,
      name: validationResult.data.name.trim(),
      is_active: validationResult.data.is_active ?? true,
    };

    if (validationResult.data.description !== undefined) {
      insertData.description = validationResult.data.description?.trim() || null;
    }

    const { data, error } = await supabase
      .from("referral_sources")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create referral source");
  }
}
