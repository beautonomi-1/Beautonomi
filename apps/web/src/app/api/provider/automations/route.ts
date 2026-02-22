import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkAutomationFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const createAutomationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trigger_type: z.string().min(1, "Trigger type is required"), // e.g., 'booking_completed', 'no_show', 'birthday'
  trigger_config: z.record(z.string(), z.any()).optional().default({}),
  action_type: z.enum(["email", "sms", "notification"]),
  action_config: z.record(z.string(), z.any()).optional().default({}),
  delay_minutes: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/provider/automations
 * 
 * List provider's marketing automations
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows automations
    const automationAccess = await checkAutomationFeatureAccess(providerId);
    if (!automationAccess.enabled) {
      return errorResponse(
        "Marketing automations require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Use service role client for template seeding (needs elevated permissions)
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check if templates exist first
    const { data: existingTemplates } = await supabaseAdmin
      .from("marketing_automations")
      .select("id")
      .eq("provider_id", providerId)
      .eq("is_template", true)
      .limit(1);

    // Only seed if no templates exist
    if (!existingTemplates || existingTemplates.length === 0) {
      try {
        await supabaseAdmin.rpc('seed_provider_automation_templates', {
          p_provider_id: providerId
        });
      } catch (err: any) {
        // Function might not exist if migration hasn't run yet
        // This is okay - templates will be seeded when migration runs
        console.warn("Template seeding function not available:", err?.message || "Migration 193 may not have run yet");
      }
    }

    // Fetch all automations (including templates) using admin client for consistency
    const { data: automations, error } = await supabaseAdmin
      .from("marketing_automations")
      .select("*")
      .eq("provider_id", providerId)
      .order("is_template", { ascending: true }) // Templates first
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(automations || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch automations");
  }
}

/**
 * POST /api/provider/automations
 * 
 * Create a new marketing automation
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows automations
    const automationAccess = await checkAutomationFeatureAccess(providerId);
    if (!automationAccess.enabled) {
      return errorResponse(
        "Marketing automations require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Check automation limit
    if (automationAccess.maxAutomations) {
      const { data: existingAutomations } = await supabase
        .from("marketing_automations")
        .select("id")
        .eq("provider_id", providerId);

      if ((existingAutomations?.length || 0) >= automationAccess.maxAutomations) {
        return errorResponse(
          `You've reached your automation limit (${automationAccess.maxAutomations}). Please upgrade your plan to create more automations.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    const body = await request.json();
    const validated = createAutomationSchema.parse(body);

    const { data: automation, error } = await supabase
      .from("marketing_automations")
      .insert({
        provider_id: providerId,
        ...validated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(automation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create automation");
  }
}
