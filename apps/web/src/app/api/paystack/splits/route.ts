import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  createSplit,
  listSplits,
  CreateSplitRequest,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/paystack/splits
 * List transaction splits
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const perPage = searchParams.get("perPage");
    const page = searchParams.get("page");
    const active = searchParams.get("active");

    const response = await listSplits({
      perPage: perPage ? parseInt(perPage) : undefined,
      page: page ? parseInt(page) : undefined,
      active: active ? active === "true" : undefined,
    });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error listing splits:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to list splits",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/splits
 * Create transaction split for platform commission
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      type,
      currency,
      subaccounts,
      bearer_type,
      bearer_subaccount,
    } = body;

    // Validate required fields
    if (!name || !type || !currency || !subaccounts || !bearer_type) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Missing required fields: name, type, currency, subaccounts, bearer_type",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Validate subaccounts
    if (!Array.isArray(subaccounts) || subaccounts.length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "subaccounts must be a non-empty array",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Validate share totals
    if (type === "percentage") {
      const totalShare = subaccounts.reduce(
        (sum: number, sub: any) => sum + (sub.share || 0),
        0
      );
      if (totalShare !== 100) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Total percentage share must equal 100",
              code: "VALIDATION_ERROR",
            },
          },
          { status: 400 }
        );
      }
    }

    const splitRequest: CreateSplitRequest = {
      name,
      type: type as "percentage" | "flat",
      currency,
      subaccounts: subaccounts.map((sub: any) => ({
        subaccount: sub.subaccount,
        share: sub.share,
      })),
      bearer_type: bearer_type as "account" | "subaccount" | "all-proportional" | "all",
      bearer_subaccount,
    };

    const response = await createSplit(splitRequest);

    // Store split in database
    const supabase = await getSupabaseServer();
    await (supabase.from("paystack_splits") as any).insert({
      split_id: response.data.id,
      split_code: response.data.split_code,
      name: response.data.name,
      type: response.data.type,
      currency: response.data.currency,
      bearer_type: response.data.bearer_type,
      bearer_subaccount: response.data.bearer_subaccount,
      active: response.data.active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error creating split:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to create split",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
