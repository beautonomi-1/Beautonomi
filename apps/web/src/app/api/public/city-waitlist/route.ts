import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";

const createCityWaitlistSchema = z
  .object({
    city_name: z.string().min(1, "City name is required"),
    name: z.string().min(1, "Name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    country_code: z.string().length(2).optional(),
    country_name: z.string().optional(),
    source: z.enum(["web", "customer_app", "provider_app"]).optional(),
    persona: z.enum(["customer", "provider"]).optional(),
    is_building_owner: z.boolean().optional().default(false),
    building_address: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const email = data.email?.trim() ?? "";
    const phone = data.phone?.trim() ?? "";
    const hasEmail = email.length > 0 && email.includes("@");
    const hasPhone = phone.length >= 7;
    if (!hasEmail && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email or phone is required",
        path: ["email"],
      });
    }
  });

/**
 * POST /api/public/city-waitlist
 *
 * Join city waitlist (public endpoint, no auth required)
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const body = await request.json();
    const validationResult = createCityWaitlistSchema.safeParse(body);

    if (!validationResult.success) {
      return handleApiError(
        new Error(validationResult.error.issues.map((e: { message: string }) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    const data = validationResult.data;
    const supabase = await getSupabaseServer(request);

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    const countryCode = data.country_code?.trim().toUpperCase() || null;
    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;

    if (email || phone) {
      let duplicateQuery = supabase
        .from("city_waitlist")
        .select("id")
        .eq("status", "pending")
        .eq("city_name", data.city_name.trim());

      if (countryCode) {
        duplicateQuery = duplicateQuery.eq("country_code", countryCode);
      }

      if (email && phone) {
        duplicateQuery = duplicateQuery.or(`email.eq.${email},phone.eq.${phone}`);
      } else if (email) {
        duplicateQuery = duplicateQuery.eq("email", email);
      } else if (phone) {
        duplicateQuery = duplicateQuery.eq("phone", phone);
      }

      const { data: existing } = await duplicateQuery.limit(1).maybeSingle();

      if (existing) {
        return handleApiError(
          new Error("You're already on the waitlist for this city"),
          "You're already on the waitlist for this city",
          "DUPLICATE_ENTRY",
          409,
        );
      }
    }

    const { data: entry, error: insertError } = await supabase
      .from("city_waitlist")
      .insert({
        user_id: userId,
        city_name: data.city_name.trim(),
        name: data.name.trim(),
        email,
        phone,
        country_code: countryCode,
        country_name: data.country_name?.trim() || null,
        source: data.source ?? "web",
        persona: data.persona ?? "customer",
        is_building_owner: data.is_building_owner || false,
        building_address: data.building_address?.trim() || null,
        notes: data.notes?.trim() || null,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return successResponse({
      entry: {
        id: entry.id,
        city_name: entry.city_name,
        name: entry.name,
        message: "Successfully joined the waitlist! We'll notify you when Beautonomi becomes available in your city.",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to join city waitlist");
  }
}
