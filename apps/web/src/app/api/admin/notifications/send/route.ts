import { NextRequest, NextResponse } from "next/server";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { 
  sendToUser, 
  sendToUsers, 
  sendToSegment, 
  sendTemplateNotification,
  type NotificationChannel 
} from "@/lib/notifications/onesignal";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const sendNotificationSchema = z.object({
  type: z.enum(["user", "users", "segment", "template"]),
  user_id: z.string().uuid().optional(),
  user_ids: z.array(z.string().uuid()).optional(),
  segment: z.record(z.string(), z.any()).optional(),
  template_key: z.string().optional(),
  template_variables: z.record(z.string(), z.string()).optional(),
  channels: z.array(z.enum(["push", "email", "sms", "live_activities"])).optional().default(["push"]),
  /** When using two OneSignal apps: "customer" | "provider". Omit for legacy single-app. */
  app_type: z.enum(["customer", "provider"]).optional(),
  // Notification content
  title: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  // Channel-specific content
  email_subject: z.string().optional(),
  email_body: z.string().optional(),
  sms_body: z.string().optional(),
  live_activities_config: z.record(z.string(), z.any()).optional(),
  // Additional data
  data: z.record(z.string(), z.any()).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

/**
 * POST /api/admin/notifications/send
 * 
 * Send a notification campaign
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const body = await request.json();
    const validationResult = sendNotificationSchema.safeParse(body);

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

    const {
      type,
      user_id,
      user_ids,
      segment,
      template_key,
      template_variables,
      channels,
      app_type: appType,
      title,
      message,
      email_subject: _email_subject,
      email_body: _email_body,
      sms_body: _sms_body,
      live_activities_config: _live_activities_config,
      data,
      url,
      image,
    } = validationResult.data;

    let result;

    switch (type) {
      case "user":
        if (!user_id) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "user_id is required for type 'user'",
                code: "VALIDATION_ERROR",
              },
            },
            { status: 400 }
          );
        }
        result = await sendToUser(
          user_id,
          {
            title: title!,
            message: message!,
            data,
            url,
            image,
          },
          channels as NotificationChannel[],
          appType ? { appType } : undefined
        );
        break;

      case "users":
        if (!user_ids || user_ids.length === 0) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "user_ids is required for type 'users'",
                code: "VALIDATION_ERROR",
              },
            },
            { status: 400 }
          );
        }
        result = await sendToUsers(
          user_ids,
          {
            title: title!,
            message: message!,
            data,
            url,
            image,
          },
          channels as NotificationChannel[],
          appType ? { appType } : undefined
        );
        break;

      case "segment":
        if (!segment) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "segment is required for type 'segment'",
                code: "VALIDATION_ERROR",
              },
            },
            { status: 400 }
          );
        }
        result = await sendToSegment(
          segment,
          {
            title: title!,
            message: message!,
            data,
            url,
            image,
          },
          channels as NotificationChannel[],
          appType ? { appType } : undefined
        );
        break;

      case "template":
        if (!template_key || !user_ids || user_ids.length === 0) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "template_key and user_ids are required for type 'template'",
                code: "VALIDATION_ERROR",
              },
            },
            { status: 400 }
          );
        }
        result = await sendTemplateNotification(
          template_key,
          user_ids,
          template_variables || {},
          channels as NotificationChannel[],
          appType ? { appType } : undefined
        );
        break;

      default:
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Invalid notification type",
              code: "VALIDATION_ERROR",
            },
          },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: result.error || "Failed to send notification",
            code: "SEND_ERROR",
          },
        },
        { status: 500 }
      );
    }

    try {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "superadmin",
        action: "admin.notifications.send",
        entity_type: "notification",
        entity_id: null,
        metadata: {
          type,
          user_id,
          user_ids,
          segment,
          template_key,
          channels,
          notification_id: result.notification_id,
        },
      });
    } catch (auditError) {
      console.error("Audit log failed (notification still sent):", auditError);
    }

    return NextResponse.json({
      data: {
        notification_id: result.notification_id,
        success: true,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send notification";
    console.error("Unexpected error in /api/admin/notifications/send:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: message.includes("OneSignal") || message.includes("configured")
            ? message
            : "Failed to send notification",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

