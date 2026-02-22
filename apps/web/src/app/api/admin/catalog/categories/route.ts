import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/admin/catalog/categories
 * 
 * Get all categories with service counts
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    // There is no separate "categories" table - only global_service_categories exists
    // Return empty array since this endpoint is not applicable
    return NextResponse.json({
      data: [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/categories:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch categories",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/catalog/categories
 * 
 * Create a new category
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }
    const body = await request.json();

    // Validate request body
    const validationResult = categorySchema.safeParse(body);
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

    const _ = validationResult.data;
    void _;

    // Categories endpoint is deprecated - use global-categories instead
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Categories endpoint is deprecated. Please use global-categories instead.",
          code: "DEPRECATED_ENDPOINT",
        },
      },
      { status: 410 }
    );
  } catch (error) {
    console.error("Unexpected error in /api/admin/catalog/categories:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create category",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

