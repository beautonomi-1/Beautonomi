import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * §Provider-launch (2026-05): force the Node.js runtime so we can rely on
 * the standard JSON body parser + service-role client. The route also acts
 * as the last line of defence against oversized drafts (see `sanitizeDraft`).
 */
export const runtime = "nodejs";

/** Drop any `data:` URLs that may have leaked into a legacy client cache. */
function stripDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null;
  return trimmed;
}

/** Strip `data:` URLs from arrays of photo URLs (gallery). */
function stripDataUrls(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => stripDataUrl(v))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Remove `data:` photo URLs from the draft *and* enforce a hard cap on the
 * serialized payload size. The Vercel function payload ceiling (~4.5MB)
 * lives outside our code, but we add this 1MB guard so a single accidental
 * field never persists a multi-megabyte JSON blob into Postgres — that used
 * to lock the wizard into a permanent 413 once the draft was reloaded.
 */
const MAX_DRAFT_BYTES = 1_000_000;

function sanitizeDraft(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const draft = { ...(input as Record<string, unknown>) };
  draft.thumbnail_url = stripDataUrl(draft.thumbnail_url) ?? null;
  draft.avatar_url = stripDataUrl(draft.avatar_url) ?? null;
  draft.gallery = stripDataUrls(draft.gallery);
  return draft;
}

/**
 * GET /api/provider/onboarding/draft
 * Get saved onboarding draft for current user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    const { data: draft, error } = await supabase
      .from("provider_onboarding_drafts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine
      throw error;
    }

    return successResponse(draft || null);
  } catch (error) {
    return handleApiError(error, "Failed to load draft");
  }
}

/**
 * POST /api/provider/onboarding/draft
 * Save onboarding draft
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { draft_data, current_step } = body;

    if (!draft_data) {
      return handleApiError(
        new Error("draft_data is required"),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // §Provider-launch (2026-05): strip any inline `data:` images that may
    // still be lingering on a legacy client. Without this guard, reloading
    // such a draft would re-hydrate the bloated state and re-trigger the
    // FUNCTION_PAYLOAD_TOO_LARGE 413 on the next auto-save.
    const sanitizedDraft = sanitizeDraft(draft_data);
    const serializedSize = Buffer.byteLength(JSON.stringify(sanitizedDraft), "utf8");
    if (serializedSize > MAX_DRAFT_BYTES) {
      return errorResponse(
        "Draft is too large after sanitization. Please re-upload large photos before continuing.",
        "DRAFT_TOO_LARGE",
        413,
      );
    }

    // Upsert draft
    const { data: draft, error } = await supabase
      .from("provider_onboarding_drafts")
      .upsert(
        {
          user_id: user.id,
          draft_data: sanitizedDraft,
          current_step: current_step || 1,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Update provider_onboarding_tracking (non-blocking, uses admin client to bypass RLS)
    try {
      const adminSupabase = getSupabaseAdmin();
      const tenantId = await resolveTenantIdWithZaFallback(request);
      await adminSupabase
        .from("provider_onboarding_tracking")
        .upsert(
          {
            user_id: user.id,
            tenant_id: tenantId,
            wizard_status: "in_progress",
            current_step: current_step || 1,
            last_progress_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch (trackingErr) {
      console.warn("Onboarding tracking update (non-fatal):", trackingErr);
    }

    return successResponse(draft);
  } catch (error) {
    return handleApiError(error, "Failed to save draft");
  }
}

/**
 * DELETE /api/provider/onboarding/draft
 * Delete saved draft (after successful onboarding)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    const { error } = await supabase
      .from("provider_onboarding_drafts")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete draft");
  }
}
