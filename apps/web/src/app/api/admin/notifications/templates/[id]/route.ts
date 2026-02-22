import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateTemplateSchema = z.object({
  key: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  channels: z.array(z.enum(["push", "email", "sms", "live_activities"])).optional(),
  // Channel-specific content
  email_subject: z.string().optional().nullable(),
  email_body: z.string().optional().nullable(),
  sms_body: z.string().optional().nullable(),
  live_activities_config: z.record(z.string(), z.any()).optional().nullable(),
  // Template metadata
  variables: z.array(z.string()).optional(),
  url: z.string().url().optional().nullable(),
  image: z.string().url().optional().nullable(),
  onesignal_template_id: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
  description: z.string().optional().nullable(),
});

/**
 * GET /api/admin/notifications/templates/[id]
 * 
 * Get a single notification template
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
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

    const { data: template, error } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !template) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Template not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: template,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/templates/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch template",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/notifications/templates/[id]
 * 
 * Update a notification template
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
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

    const validationResult = updateTemplateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const { data: template, error } = await (supabase
      .from("notification_templates") as any)
      .update(validationResult.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !template) {
      console.error("Error updating template:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update template",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.notifications.template.update",
      entity_type: "notification_template",
      entity_id: id,
      metadata: validationResult.data,
    });

    return NextResponse.json({
      data: template,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/templates/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update template",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/notifications/templates/[id]
 * 
 * Delete a notification template (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
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

    const { data: template, error } = await (supabase
      .from("notification_templates") as any)
      .update({ enabled: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !template) {
      console.error("Error deleting template:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete template",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.notifications.template.delete",
      entity_type: "notification_template",
      entity_id: id,
      metadata: { soft_deleted: true },
    });

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/templates/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete template",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
