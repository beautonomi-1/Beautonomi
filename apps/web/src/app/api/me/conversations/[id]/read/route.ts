import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { markMessagesAsRead } from '@/lib/chat/supabase-chat';

/**
 * POST /api/me/conversations/[id]/read
 * 
 * Mark messages in a conversation as read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const { id: conversationId } = await params;
    const supabase = await getSupabaseServer();

    // Verify user is a participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (!participant) {
      return handleApiError(
        new Error('Forbidden'),
        'You are not a participant in this conversation',
        'FORBIDDEN',
        403
      );
    }

    await markMessagesAsRead(conversationId, user.id);

    return successResponse({ success: true });
  } catch (error: any) {
    return handleApiError(error, 'Failed to mark messages as read');
  }
}
