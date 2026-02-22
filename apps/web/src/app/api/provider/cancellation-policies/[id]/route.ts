import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from '@/lib/supabase/api-helpers';
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  hours_before: z.number().int().min(0).optional(),
  refund_percentage: z.number().int().min(0).max(100).optional(),
  fee_amount: z.number().min(0).optional(),
  fee_type: z.enum(["fixed", "percentage"]).optional(),
  is_default: z.boolean().optional(),
});

/**
 * PATCH /api/provider/cancellation-policies/[id]
 * 
 * Update a cancellation policy
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = updatePolicySchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // For superadmin, allow updating any policy; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the policy itself
      const { data: policyCheck } = await supabase
        .from('cancellation_policies')
        .select('provider_id')
        .eq('id', id)
        .single();
      if (policyCheck) {
        providerId = policyCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify policy exists
    let verifyQuery = supabase
      .from('cancellation_policies')
      .select('provider_id')
      .eq('id', id);

    if (providerId) {
      verifyQuery = verifyQuery.eq('provider_id', providerId);
    }

    const { data: existingPolicy } = await verifyQuery.single();

    if (!existingPolicy) {
      return notFoundResponse('Cancellation policy not found');
    }

    // If setting as default, unset other defaults
    if (validationResult.data.is_default && providerId) {
      await supabase
        .from('cancellation_policies')
        .update({ is_default: false })
        .eq('provider_id', providerId)
        .neq('id', id);
    }

    // Prepare update data
    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name.trim();
    }
    if (validationResult.data.hours_before !== undefined) {
      updateData.hours_before = validationResult.data.hours_before;
    }
    if (validationResult.data.refund_percentage !== undefined) {
      updateData.refund_percentage = validationResult.data.refund_percentage;
    }
    if (validationResult.data.fee_amount !== undefined) {
      updateData.fee_amount = validationResult.data.fee_amount;
    }
    if (validationResult.data.fee_type !== undefined) {
      updateData.fee_type = validationResult.data.fee_type;
    }
    if (validationResult.data.is_default !== undefined) {
      updateData.is_default = validationResult.data.is_default;
    }
    updateData.updated_at = new Date().toISOString();

    const { data: policy, error } = await supabase
      .from('cancellation_policies')
      .update(updateData)
      .eq('id', id)
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
    return handleApiError(error, 'Failed to update cancellation policy');
  }
}

/**
 * DELETE /api/provider/cancellation-policies/[id]
 * 
 * Delete a cancellation policy
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // For superadmin, allow deleting any policy; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the policy itself
      const { data: policyCheck } = await supabase
        .from('cancellation_policies')
        .select('provider_id')
        .eq('id', id)
        .single();
      if (policyCheck) {
        providerId = policyCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify policy exists and is not default
    let verifyQuery = supabase
      .from('cancellation_policies')
      .select('provider_id, is_default')
      .eq('id', id);

    if (providerId) {
      verifyQuery = verifyQuery.eq('provider_id', providerId);
    }

    const { data: existingPolicy } = await verifyQuery.single();

    if (!existingPolicy) {
      return notFoundResponse('Cancellation policy not found');
    }

    if (existingPolicy.is_default) {
      return errorResponse(
        'Cannot delete default policy',
        'VALIDATION_ERROR',
        400
      );
    }

    const { error } = await supabase
      .from('cancellation_policies')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete cancellation policy');
  }
}
