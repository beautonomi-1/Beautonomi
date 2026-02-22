import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    
    if (!supabase) {
      console.error("Supabase client not available in preference-options API");
      return successResponse([]);
    }
    
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'language', 'currency', or 'timezone'

    let query = supabase
      .from('preference_options')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching preference options:", error);
      return successResponse([]);
    }

    return successResponse(data || []);
  } catch (error) {
    console.error("Error in preference-options GET:", error);
    return successResponse([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    
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
    
    const body = await request.json();

    const { type, code, name, display_order, is_active, metadata } = body;

    if (!type || !name || !name.trim()) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Type and name are required",
            code: "VALIDATION_ERROR"
          } 
        },
        { status: 400 }
      );
    }

    if (!['language', 'currency', 'timezone'].includes(type)) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: "Type must be 'language', 'currency', or 'timezone'",
            code: "VALIDATION_ERROR"
          } 
        },
        { status: 400 }
      );
    }

    // Check for duplicate code if code is provided
    if (code && code.trim()) {
      const { data: existingByCode, error: codeCheckError } = await supabase
        .from('preference_options')
        .select('id')
        .eq('type', type)
        .eq('code', code.trim())
        .maybeSingle();

      if (codeCheckError) {
        console.error("Error checking duplicate code:", codeCheckError);
      } else if (existingByCode) {
        return NextResponse.json(
          { 
            data: null,
            error: { 
              message: `A ${type} with code "${code.trim()}" already exists`,
              code: "DUPLICATE_CODE"
            } 
          },
          { status: 400 }
        );
      }
    }

    // Check for duplicate name
    const { data: existingByName, error: nameCheckError } = await supabase
      .from('preference_options')
      .select('id')
      .eq('type', type)
      .eq('name', name.trim())
      .maybeSingle();

    if (nameCheckError) {
      console.error("Error checking duplicate name:", nameCheckError);
    } else if (existingByName) {
      return NextResponse.json(
        { 
          data: null,
          error: { 
            message: `A ${type} with name "${name.trim()}" already exists`,
            code: "DUPLICATE_NAME"
          } 
        },
        { status: 400 }
      );
    }

    const insertData = {
      type,
      code: code && code.trim() ? code.trim() : null,
      name: name.trim(),
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : true,
      metadata: metadata || null,
    };

    console.log("Inserting preference option:", { type, code: insertData.code, name: insertData.name });

    const { data, error } = await supabase
      .from('preference_options')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error inserting preference option:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      
      // Check for unique constraint violations
      if (error.code === '23505') {
        if (error.message.includes('type, code') || error.details?.includes('type, code')) {
          return NextResponse.json(
            { 
              data: null,
              error: { 
                message: `A ${type} with code "${code}" already exists`,
                code: "DUPLICATE_CODE"
              } 
            },
            { status: 400 }
          );
        }
        if (error.message.includes('type, name') || error.details?.includes('type, name')) {
          return NextResponse.json(
            { 
              data: null,
              error: { 
                message: `A ${type} with name "${name}" already exists`,
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

    return successResponse(data, 201);
  } catch (error: any) {
    console.error("Error in preference-options POST:", error);
    return handleApiError(error, "Failed to create preference option");
  }
}
