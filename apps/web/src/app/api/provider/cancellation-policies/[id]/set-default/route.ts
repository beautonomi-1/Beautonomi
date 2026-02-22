import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from '@/lib/supabase/api-helpers';
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * PATCH /api/provider/cancellation-policies/[id]/set-default
 * 
 * Set a cancellation policy as default
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

    // For superadmin, allow setting default for any policy; for providers, only their own
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

    // Unset all other default policies for this provider
    if (providerId) {
      await supabase
        .from('cancellation_policies')
        .update({ is_default: false })
        .eq('provider_id', providerId)
        .neq('id', id);
    }

    // Set this policy as default
    const { data: policy, error } = await supabase
      .from('cancellation_policies')
      .update({ is_default: true, updated_at: new Date().toISOString() })
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
      is_default: true,
      provider_id: policy.provider_id,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
    };

    return successResponse(transformedPolicy);
  } catch (error) {
    return handleApiError(error, 'Failed to set default cancellation policy');
  }
}
