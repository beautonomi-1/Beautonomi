import type { SupabaseClient } from "@supabase/supabase-js";
import { createProviderSupportTicket } from "@/lib/support/create-support-ticket";

export async function createSupportTicketForProvider(
  _supabase: SupabaseClient,
  input: {
    providerId: string;
    userId: string;
    tenantId: string;
    applicationId: string;
    applicationNo: string;
    subject: string;
    initialMessage: string;
  },
): Promise<string | null> {
  const ticket = await createProviderSupportTicket({
    providerId: input.providerId,
    ownerUserId: input.userId,
    actorUserId: null,
    subject: input.subject,
    message: input.initialMessage,
    priority: "medium",
    category: "terminal_onboarding",
    supportContextType: "terminal_merchant_application",
    supportContextId: input.applicationId,
    supportContextLabel: input.applicationNo,
    messageFrom: "staff",
  });

  return ticket.id ?? null;
}
