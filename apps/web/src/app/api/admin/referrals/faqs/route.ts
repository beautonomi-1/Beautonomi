import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  answer_type: z.enum(["text", "list"]).default("text"),
  answer_list: z.array(z.string()).optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().optional().default(true),
});

export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("referral_faqs")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === "42P01") {
        return successResponse([]);
      }
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch referral FAQs");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const body = faqSchema.parse(await request.json());

    const { data: row, error } = await (supabase.from("referral_faqs") as any)
      .insert({
        question: body.question,
        answer: body.answer_type === "text" ? body.answer : null,
        answer_type: body.answer_type,
        answer_list: body.answer_type === "list" ? body.answer_list : null,
        display_order: body.display_order,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, return error with instructions
      if (error.code === "42P01") {
        return handleApiError(
          new Error("referral_faqs table does not exist. Please run the migration first."),
          "Database table not found",
          "TABLE_NOT_FOUND",
          500
        );
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "create",
      entity_type: "referral_faq",
      entity_id: row.id,
      metadata: { question: body.question },
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create referral FAQ");
  }
}
