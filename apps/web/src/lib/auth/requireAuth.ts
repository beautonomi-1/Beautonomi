/**
 * Server-side authentication requirement helper
 * 
 * Use this in API routes to check if user is authenticated
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface AuthResult {
  user: { id: string; role: string };
}

/**
 * Requires user to be authenticated
 * 
 * @returns User object if authenticated, null if not
 */
export async function requireAuth(): Promise<AuthResult | null> {
  const supabase = await getSupabaseServer();

  // Get authenticated user (validates with Supabase Auth server)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Get user role from users table
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (userDataError || !userData) {
    return null;
  }

  return {
    user: {
      id: userData.id,
      role: userData.role,
    },
  };
}

/**
 * Returns unauthorized response
 */
export function unauthorizedResponse(message: string = "Authentication required") {
  return NextResponse.json(
    {
      data: null,
      error: {
        message,
        code: "UNAUTHORIZED",
      },
    },
    { status: 401 }
  );
}
