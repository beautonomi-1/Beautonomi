import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data, error } = await supabase
      .from('preference_options')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Preference option not found",
            code: "NOT_FOUND"
          } 
        },
        { status: 404 }
      );
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch preference option");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    
    if (!supabase) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Supabase client not available",
            code: "SERVER_ERROR"
          } 
        },
        { status: 500 }
      );
    }
    
    const { id } = await params;
    const body = await request.json();

    const { code, name, display_order, is_active, metadata } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Name is required",
            code: "VALIDATION_ERROR"
          } 
        },
        { status: 400 }
      );
    }

    // Get current option to check for conflicts
    const { data: currentOption, error: fetchError } = await supabase
      .from('preference_options')
      .select('type, code, name')
      .eq('id', id)
      .single();

    if (fetchError || !currentOption) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Preference option not found",
            code: "NOT_FOUND"
          } 
        },
        { status: 404 }
      );
    }

    // Check for duplicate code if code is being changed and is provided
    if (code !== undefined && code !== currentOption.code) {
      const finalCode = code && code.trim() ? code.trim() : null;
      if (finalCode) {
        const { data: existingByCode, error: codeCheckError } = await supabase
          .from('preference_options')
          .select('id')
          .eq('type', currentOption.type)
          .eq('code', finalCode)
          .neq('id', id)
          .maybeSingle();

        if (codeCheckError) {
          console.error("Error checking duplicate code:", codeCheckError);
        } else if (existingByCode) {
          return NextResponse.json(
            { 
              data: null,
              error: { 
                message: `A ${currentOption.type} with code "${finalCode}" already exists`,
                code: "DUPLICATE_CODE"
              } 
            },
            { status: 400 }
          );
        }
      }
    }

    // Check for duplicate name if name is being changed
    if (name.trim() !== currentOption.name) {
      const { data: existingByName, error: nameCheckError } = await supabase
        .from('preference_options')
        .select('id')
        .eq('type', currentOption.type)
        .eq('name', name.trim())
        .neq('id', id)
        .maybeSingle();

      if (nameCheckError) {
        console.error("Error checking duplicate name:", nameCheckError);
      } else if (existingByName) {
        return NextResponse.json(
          { 
            data: null,
            error: { 
              message: `A ${currentOption.type} with name "${name.trim()}" already exists`,
              code: "DUPLICATE_NAME"
            } 
          },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {
      name: name.trim(),
    };

    if (code !== undefined) {
      updates.code = code && code.trim() ? code.trim() : null;
    }
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;
    if (metadata !== undefined) updates.metadata = metadata;

    const { data, error } = await supabase
      .from('preference_options')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Error updating preference option:", error);
      // Check for unique constraint violations
      if (error.code === '23505') {
        if (error.message.includes('type, code')) {
          return NextResponse.json(
            { 
              data: null,
              error: { 
                message: `A ${currentOption.type} with code "${code}" already exists`,
                code: "DUPLICATE_CODE"
              } 
            },
            { status: 400 }
          );
        }
        if (error.message.includes('type, name')) {
          return NextResponse.json(
            { 
              data: null,
              error: { 
                message: `A ${currentOption.type} with name "${name}" already exists`,
                code: "DUPLICATE_NAME"
              } 
            },
            { status: 400 }
          );
        }
      }
      
      // Check for RLS policy violations
      if (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('policy')) {
        console.error("RLS policy violation - user may not have superadmin role in database");
        return NextResponse.json(
          { 
            data: null,
            error: { 
              message: "Permission denied. Please ensure you have superadmin role.",
              code: "PERMISSION_DENIED"
            } 
          },
          { status: 403 }
        );
      }
      
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Preference option not found",
            code: "NOT_FOUND"
          } 
        },
        { status: 404 }
      );
    }

    return successResponse(data);
  } catch (error: any) {
    console.error("Error in preference-options PUT:", error);
    return handleApiError(error, "Failed to update preference option");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { error } = await supabase
      .from('preference_options')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return successResponse(null, 204);
  } catch (error) {
    return handleApiError(error, "Failed to delete preference option");
  }
}
