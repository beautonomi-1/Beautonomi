import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const templateSchema = z.object({
  key: z.string().min(1, "Key is required"),
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  channels: z.array(z.enum(["push", "email", "sms", "live_activities"])).min(1, "At least one channel is required"),
  // Channel-specific content
  email_subject: z.string().optional().nullable(),
  email_body: z.string().optional().nullable(),
  sms_body: z.string().optional().nullable(),
  live_activities_config: z.record(z.string(), z.any()).optional().nullable(),
  // Template metadata
  variables: z.array(z.string()).optional().default([]),
  url: z.string().url().optional().nullable(),
  image: z.string().url().optional().nullable(),
  onesignal_template_id: z.string().optional().nullable(), // If using OneSignal's template system
  enabled: z.boolean().optional().default(true),
  description: z.string().optional().nullable(),
});

const _updateTemplateSchema = templateSchema.partial();

/**
 * GET /api/admin/notifications/templates
 * 
 * Get all notification templates
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        {
          data: [],
          error: null,
        },
        { status: 200 }
      );
    }

    const { data: templates, error } = await supabase
      .from("notification_templates")
      .select("*")
      .order("key", { ascending: true });

    if (error) {
      console.error("Error fetching templates:", error);
      // Return empty array instead of error to prevent crashes
      return NextResponse.json({
        data: [],
        error: null,
      });
    }

    return NextResponse.json({
      data: templates || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/templates:", error);
    return NextResponse.json(
      {
        data: [],
        error: null,
      },
      { status: 200 }
    );
  }
}

/**
 * POST /api/admin/notifications/templates
 * 
 * Create a new notification template
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    
    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Database connection failed",
            code: "DATABASE_ERROR",
          },
        },
        { status: 500 }
      );
    }
    
    const body = await request.json();

    const validationResult = templateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    const { data: template, error } = await (supabase
      .from("notification_templates") as any)
      .insert(validationResult.data)
      .select()
      .single();

    if (error || !template) {
      console.error("Error creating template:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create template",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.notifications.template.create",
      entity_type: "notification_template",
      entity_id: (template as any).id,
      metadata: { key: (template as any).key, channels: (template as any).channels, enabled: (template as any).enabled },
    });

    return NextResponse.json({
      data: template,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/templates:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create template",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

