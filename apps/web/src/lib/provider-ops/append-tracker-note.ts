import type { SupabaseClient } from "@supabase/supabase-js";

export async function appendTrackerAdminNote(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    userId: string;
    note: string;
    adminName: string;
  }
): Promise<string> {
  const { data: existing } = await supabase
    .from("provider_onboarding_tracking")
    .select("id, admin_notes")
    .eq("user_id", args.userId)
    .maybeSingle();

  const existingNotes = (existing?.admin_notes as string) || "";
  const timestamp = new Date().toISOString();
  const newNote = `[${timestamp}] ${args.adminName}: ${args.note.trim()}`;
  const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

  const { error: upsertErr } = await supabase.from("provider_onboarding_tracking").upsert(
    {
      user_id: args.userId,
      tenant_id: args.tenantId,
      admin_notes: updatedNotes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upsertErr) throw upsertErr;

  return newNote;
}
