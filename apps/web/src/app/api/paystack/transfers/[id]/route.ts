import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  fetchTransfer,
  finalizeTransfer,
  verifyTransfer,
} from "@/lib/payments/paystack-complete";

/**
 * GET /api/paystack/transfers/[id]
 * Fetch transfer details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const response = await fetchTransfer(id);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/transfers/[id]/finalize
 * Finalize transfer with OTP
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { otp } = body;

    if (!otp) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "OTP is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const response = await finalizeTransfer(id, otp);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error finalizing transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to finalize transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/paystack/transfers/[id]/verify
 * Verify transfer by reference
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const response = await verifyTransfer(id);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error verifying transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to verify transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
