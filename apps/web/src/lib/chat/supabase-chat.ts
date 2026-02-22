import { getSupabaseServer } from '@/lib/supabase/server';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at?: string;
  message_type?: 'text' | 'image' | 'file';
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  participant_ids: string[];
  last_message_id?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
  booking_id?: string;
  metadata?: Record<string, any>;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  last_read_at?: string;
  created_at: string;
}

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
  userId1: string,
  userId2: string,
  bookingId?: string
): Promise<Conversation> {
  const supabase = await getSupabaseServer();

  // Check if conversation already exists
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('*, conversation_participants(*)')
    .contains('participant_ids', [userId1, userId2])
    .maybeSingle();

  if (findError && findError.code !== 'PGRST116') {
    throw new Error(`Failed to find conversation: ${findError.message}`);
  }

  if (existing) {
    return existing as Conversation;
  }

  // Create new conversation
  const { data: newConversation, error: createError } = await supabase
    .from('conversations')
    .insert({
      participant_ids: [userId1, userId2],
      booking_id: bookingId,
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create conversation: ${createError.message}`);
  }

  // Create participants
  await Promise.all([
    supabase.from('conversation_participants').insert({
      conversation_id: newConversation.id,
      user_id: userId1,
    }),
    supabase.from('conversation_participants').insert({
      conversation_id: newConversation.id,
      user_id: userId2,
    }),
  ]);

  return newConversation as Conversation;
}

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType: 'text' | 'image' | 'file' = 'text',
  metadata?: Record<string, any>
): Promise<Message> {
  const supabase = await getSupabaseServer();

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
      metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to send message: ${error.message}`);
  }

  // Update conversation's last message
  await supabase
    .from('conversations')
    .update({
      last_message_id: message.id,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return message as Message;
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  conversationId: string,
  limit: number = 50,
  before?: string
): Promise<Message[]> {
  const supabase = await getSupabaseServer();

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get messages: ${error.message}`);
  }

  return (data || []).reverse() as Message[];
}

/**
 * Get conversations for a user
 */
export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const supabase = await getSupabaseServer();

  const { data, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations(*)')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to get conversations: ${error.message}`);
  }

  return (data || []).map((item: any) => item.conversations).filter(Boolean) as Conversation[];
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  const supabase = await getSupabaseServer();

  // Update participant's last_read_at
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  // Mark unread messages as read
  const { data: unreadMessages } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (unreadMessages && unreadMessages.length > 0) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadMessages.map((m) => m.id));
  }
}

/**
 * Subscribe to new messages in a conversation
 */
export function subscribeToMessages(
  _conversationId: string,
  _callback: (message: Message) => void
): RealtimeChannel {
  // This would be used on the client side with Supabase client
  // For server-side, we'd use webhooks or polling
  throw new Error('subscribeToMessages should be used on client side with Supabase client');
}
