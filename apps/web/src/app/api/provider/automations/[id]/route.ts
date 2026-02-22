import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkAutomationFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  action_config: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/provider/automations/[id]
 * 
 * Get a specific automation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: automation, error } = await supabase
      .from("marketing_automations")
      .select("*")
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (error || !automation) {
      return notFoundResponse("Automation not found");
    }

    return successResponse(automation);
  } catch (error) {
    return handleApiError(error, "Failed to fetch automation");
  }
}

/**
 * PATCH /api/provider/automations/[id]
 * 
 * Update an automation (including message template)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body = await request.json();
    const validated = updateAutomationSchema.parse(body);

    // Get existing automation to merge action_config
    const { data: existing } = await supabase
      .from("marketing_automations")
      .select("action_config")
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Automation not found");
    }

    // Merge action_config if provided
    const currentActionConfig = existing.action_config || {};
    const updatedActionConfig = validated.action_config 
      ? { ...currentActionConfig, ...validated.action_config }
      : currentActionConfig;

    const { data: automation, error } = await supabase
      .from("marketing_automations")
      .update({
        ...(validated.name && { name: validated.name }),
        ...(validated.is_active !== undefined && { is_active: validated.is_active }),
        ...(validated.action_config && { action_config: updatedActionConfig }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("provider_id", providerId)
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
    return handleApiError(error, "Failed to update automation");
  }
}

/**
 * DELETE /api/provider/automations/[id]
 * 
 * Delete an automation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { error } = await supabase
      .from("marketing_automations")
      .delete()
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .eq("is_template", false); // Can't delete templates

    if (error) {
      throw error;
    }

    return successResponse({ message: "Automation deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete automation");
  }
}
