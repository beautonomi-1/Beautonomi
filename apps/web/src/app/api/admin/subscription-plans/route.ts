import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from 'zod';
import { createPlan, updatePlan } from '@/lib/payments/paystack-complete';
import { convertToSmallestUnit } from '@/lib/payments/paystack';
import { getPaystackSecretKey } from '@/lib/payments/paystack-server';
import { resolveAdminTenantContext } from '@/lib/tenant/scoped-overrides';
import { resolveAdminApiTenantId } from '@/lib/tenant/admin-request-tenant';
import { getTenantRegionConfig } from '@/lib/regions/config';
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

// Complex feature gating structure matching migration 133
const featureGatingSchema = z.object({
  marketing_campaigns: z.object({
    enabled: z.boolean(),
    channels: z.array(z.string()).optional(),
    max_campaigns_per_month: z.number().nullable().optional(),
    max_recipients_per_campaign: z.number().nullable().optional(),
    advanced_segmentation: z.boolean().optional(),
    custom_integrations: z.boolean().optional(),
  }).optional(),
  chat_messages: z.object({
    enabled: z.boolean(),
    max_messages_per_month: z.number().nullable().optional(),
    file_attachments: z.boolean().optional(),
    group_chats: z.boolean().optional(),
  }).optional(),
  yoco_integration: z.object({
    enabled: z.boolean(),
    max_devices: z.number().nullable().optional(),
    advanced_features: z.boolean().optional(),
  }).optional(),
  staff_management: z.object({
    enabled: z.boolean(),
    max_staff_members: z.number().nullable().optional(),
  }).optional(),
  multi_location: z.object({
    enabled: z.boolean(),
    max_locations: z.number().nullable().optional(),
  }).optional(),
  booking_limits: z.object({
    enabled: z.boolean(),
    max_bookings_per_month: z.number().nullable().optional(),
  }).optional(),
  advanced_analytics: z.object({
    enabled: z.boolean(),
    basic_reports: z.boolean().optional(),
    advanced_reports: z.boolean().optional(),
    data_export: z.boolean().optional(),
    api_access: z.boolean().optional(),
    report_types: z.array(z.string()).optional(),
  }).optional(),
  marketing_automations: z.object({
    enabled: z.boolean(),
    max_automations: z.number().nullable().optional(),
  }).optional(),
  recurring_appointments: z.object({
    enabled: z.boolean(),
    advanced_patterns: z.boolean().optional(),
  }).optional(),
  express_booking: z.object({
    enabled: z.boolean(),
    max_links: z.number().nullable().optional(),
  }).optional(),
  calendar_sync: z.object({
    enabled: z.boolean(),
    providers: z.array(z.string()).optional(),
    api_access: z.boolean().optional(),
  }).optional(),
});

const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  price_monthly: z.number().min(0).optional(),
  price_yearly: z.number().min(0).optional(),
  currency: z.string().optional(),
  features: z.union([featureGatingSchema, z.record(z.string(), z.any())]).optional(), // Support both complex structure and legacy array
  is_free: z.boolean().default(false),
  is_active: z.boolean().default(true),
  is_popular: z.boolean().default(false),
  display_order: z.number().default(0),
  max_bookings_per_month: z.number().nullable().optional(),
  max_staff_members: z.number().nullable().optional(),
  max_locations: z.number().default(1),
});

const updatePlanSchema = createPlanSchema.partial().extend({
  update_existing_subscriptions: z.boolean().optional(),
  paystack_plan_code_monthly: z.string().nullable().optional(),
  paystack_plan_code_yearly: z.string().nullable().optional(),
});

function applyScopeFilter(query: any, scopeTenantId: string | null) {
  return scopeTenantId ? query.or(`tenant_id.eq.${scopeTenantId},tenant_id.is.null`) : query.is("tenant_id", null);
}

/**
 * GET /api/admin/subscription-plans
 * Get all subscription plans
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = await getSupabaseServer(request);
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);
    const scopedPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "subscription_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });

    return successResponse(scopedPlans.data || []);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch subscription plans');
  }
}

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan and sync with Paystack
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;
    const data = createPlanSchema.parse(body);
    const tenantForCurrency = scopeTenantId ?? (await resolveAdminApiTenantId(request));
    const lastResortCurrency =
      (await getTenantRegionConfig(tenantForCurrency))?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const planCurrency = data.currency ?? lastResortCurrency;

    // If not free, create Paystack plans
    let paystackPlanCodeMonthly: string | null = null;
    let paystackPlanCodeYearly: string | null = null;

    if (!data.is_free) {
      const _secretKey = await getPaystackSecretKey({ tenantId: scopeTenantId });

      // Create monthly plan in Paystack if price is set
      if (data.price_monthly && data.price_monthly > 0) {
        try {
          const monthlyPlan = await createPlan({
            name: `${data.name} (Monthly)`,
            interval: 'monthly',
            amount: convertToSmallestUnit(data.price_monthly),
            currency: planCurrency,
          }, { tenantId: scopeTenantId });
          paystackPlanCodeMonthly = monthlyPlan.data?.plan_code || null;
        } catch (err: unknown) {
          console.error('Failed to create Paystack monthly plan:', err);
          const msg = err instanceof Error ? err.message : "Unknown error";
          throw new Error(`Failed to create Paystack monthly plan: ${msg}`);
        }
      }

      // Create yearly plan in Paystack if price is set
      if (data.price_yearly && data.price_yearly > 0) {
        try {
          const yearlyPlan = await createPlan({
            name: `${data.name} (Yearly)`,
            interval: 'annually',
            amount: convertToSmallestUnit(data.price_yearly),
            currency: planCurrency,
          }, { tenantId: scopeTenantId });
          paystackPlanCodeYearly = yearlyPlan.data?.plan_code || null;
        } catch (err: unknown) {
          console.error('Failed to create Paystack yearly plan:', err);
          const msg = err instanceof Error ? err.message : "Unknown error";
          throw new Error(`Failed to create Paystack yearly plan: ${msg}`);
        }
      }
    }

    // Normalize features to JSONB object format
    let featuresJsonb: Record<string, unknown> = (data.features as Record<string, unknown>) ?? {};
    
    // If features is an array (legacy format), convert to empty object
    // The complex structure should be provided from the frontend
    if (Array.isArray(featuresJsonb)) {
      featuresJsonb = {};
    }

    // Create plan in database
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .insert({
        tenant_id: scopeTenantId,
        name: data.name,
        description: data.description,
        price_monthly: data.price_monthly,
        price_yearly: data.price_yearly,
        currency: planCurrency,
        features: featuresJsonb,
        is_free: data.is_free,
        is_active: data.is_active,
        is_popular: data.is_popular,
        display_order: data.display_order,
        max_bookings_per_month: data.max_bookings_per_month,
        max_staff_members: data.max_staff_members,
        max_locations: data.max_locations,
        paystack_plan_code_monthly: paystackPlanCodeMonthly,
        paystack_plan_code_yearly: paystackPlanCodeYearly,
      })
      .select()
      .single();

    if (planError) throw planError;

    return successResponse(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: { message: string }) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to create subscription plan');
  }
}

/**
 * PUT /api/admin/subscription-plans
 * Update a subscription plan
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;
    const { id, ...updates } = body;

    if (!id) {
      return handleApiError(
        new Error('Plan ID is required'),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }

    const data = updatePlanSchema.parse(updates);

    // Get existing plan
    const existingPlanQuery = applyScopeFilter(
      supabase.from('subscription_plans').select('*').eq('id', id),
      scopeTenantId
    );
    const { data: existingPlan, error: fetchError } = await existingPlanQuery.single();

    if (fetchError || !existingPlan) {
      throw new Error('Plan not found');
    }

    const updateExisting = data.update_existing_subscriptions;

    // Update Paystack plans if prices changed and plan is not free
    if (!data.is_free && !existingPlan.is_free) {
      const commonOpts = updateExisting !== undefined ? { update_existing_subscriptions: updateExisting } : {};
      // Update monthly plan
      if (data.price_monthly !== undefined && existingPlan.paystack_plan_code_monthly) {
        try {
          await updatePlan(
            existingPlan.paystack_plan_code_monthly,
            {
              name: `${data.name || existingPlan.name} (Monthly)`,
              amount: data.price_monthly ? convertToSmallestUnit(data.price_monthly) : undefined,
              ...commonOpts,
            },
            { tenantId: scopeTenantId }
          );
        } catch (err: unknown) {
          console.error('Failed to update Paystack monthly plan:', err);
        }
      }

      if (data.price_yearly !== undefined && existingPlan.paystack_plan_code_yearly) {
        try {
          await updatePlan(
            existingPlan.paystack_plan_code_yearly,
            {
              name: `${data.name || existingPlan.name} (Yearly)`,
              amount: data.price_yearly ? convertToSmallestUnit(data.price_yearly) : undefined,
              ...commonOpts,
            },
            { tenantId: scopeTenantId }
          );
        } catch (err: unknown) {
          console.error('Failed to update Paystack yearly plan:', err);
        }
      }
    }

    // Normalize features to JSONB object format if provided
    const updateData: Record<string, unknown> = { ...data };
    delete updateData.update_existing_subscriptions;
    if (updateData.features !== undefined) {
      // If features is an array (legacy format), preserve existing structure
      if (Array.isArray(updateData.features)) {
        // Don't overwrite complex structure with array - preserve existing
        delete updateData.features;
      } else {
        // Merge with existing features to preserve other feature categories
        if (existingPlan.features && typeof existingPlan.features === 'object' && !Array.isArray(existingPlan.features) && updateData.features && typeof updateData.features === 'object' && !Array.isArray(updateData.features)) {
          updateData.features = { ...(existingPlan.features as Record<string, unknown>), ...(updateData.features as Record<string, unknown>) };
        }
      }
    }

    // Update plan in database
    const planUpdateQuery = applyScopeFilter(
      supabase
        .from('subscription_plans')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id),
      scopeTenantId
    );
    const { data: plan, error: planError } = await planUpdateQuery.select().single();

    if (planError) {
      const detail = (planError as any).message || (planError as any).details || String(planError);
      return handleApiError(
        new Error(`Database error: ${detail}`),
        `Failed to update plan: ${detail}`,
        'DB_ERROR',
        400
      );
    }

    return successResponse(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: { message: string }) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    const msg = (error instanceof Error) ? error.message : 'Failed to update subscription plan';
    return handleApiError(error, msg);
  }
}
