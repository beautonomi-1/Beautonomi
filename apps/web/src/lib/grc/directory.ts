import { ALL_ADMIN_ROLES } from "@beautonomi/admin-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type GrcDirectoryUser = { id: string; full_name: string | null; email: string | null; role: string };

/** Admin-portal users: the only people who can hold GRC roles, own records or review evidence. */
export async function loadGrcDirectory(): Promise<GrcDirectoryUser[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, full_name, email, role")
    .in("role", ALL_ADMIN_ROLES)
    .order("full_name", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as GrcDirectoryUser[];
}
