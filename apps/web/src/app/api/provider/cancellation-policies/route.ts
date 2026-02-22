import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from '@/lib/supabase/api-helpers';
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createPolicySchema = z.object({
  name: z.string().min(1),
  hours_before: z.number().int().min(0),
  refund_percentage: z.number().int().min(0).max(100),
  fee_amount: z.number().min(0).optional(),
  fee_type: z.enum(["fixed", "percentage"]).optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/provider/cancellation-policies
 * 
 * Get provider's cancellation policies
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's policies
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
      .from('cancellation_policies')
      .select('*');

    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    // Try to order by hours_before, but handle gracefully if column doesn't exist
    const { data: policies, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform to ensure all fields are present and sort by hours_before (descending)
    const transformedPolicies = (policies || [])
      .map((p: any) => ({
        id: p.id,
        name: p.name || 'Unnamed Policy',
        hours_before: p.hours_before ?? p.hours_before_cutoff ?? 24,
        refund_percentage: p.refund_percentage ?? 0,
        fee_amount: p.fee_amount ?? 0,
        fee_type: p.fee_type || 'fixed',
        is_default: p.is_default ?? false,
        provider_id: p.provider_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }))
      .sort((a, b) => {
        // Sort by is_default first (defaults first), then by hours_before (descending)
        if (a.is_default !== b.is_default) {
          return a.is_default ? -1 : 1;
        }
        return b.hours_before - a.hours_before;
      });

    return successResponse(transformedPolicies);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch cancellation policies');
  }
}

/**
 * POST /api/provider/cancellation-policies
 * 
 * Create a new cancellation policy
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

    // Validate input
    const validationResult = createPolicySchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const data = validationResult.data;

    // If this is set as default, unset other defaults
    if (data.is_default) {
      await supabase
        .from('cancellation_policies')
        .update({ is_default: false })
        .eq('provider_id', providerId);
    }

    const insertData: any = {
      provider_id: providerId,
      name: data.name.trim(),
      hours_before: data.hours_before,
      refund_percentage: data.refund_percentage,
      fee_amount: data.fee_amount || 0,
      fee_type: data.fee_type || 'fixed',
      is_default: data.is_default || false,
    };

    const { data: policy, error } = await supabase
      .from('cancellation_policies')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Transform response
    const transformedPolicy = {
      id: policy.id,
      name: policy.name,
      hours_before: policy.hours_before,
      refund_percentage: policy.refund_percentage,
      fee_amount: policy.fee_amount ?? 0,
      fee_type: policy.fee_type || 'fixed',
      is_default: policy.is_default ?? false,
      provider_id: policy.provider_id,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
    };

    return successResponse(transformedPolicy);
  } catch (error) {
    return handleApiError(error, 'Failed to create cancellation policy');
  }
}
