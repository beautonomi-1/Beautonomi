/**
 * Portal Token Utilities
 * Functions for generating, validating, and managing portal tokens
 */

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Generate a secure random token for portal access
 */
export function generatePortalToken(): string {
  // Generate 32 random bytes (256 bits) and convert to hex (64 characters)
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a portal token for a booking
 */
export async function createPortalToken(
  supabase: SupabaseClient,
  bookingId: string,
  options: {
    expiresInDays?: number; // Default 7 days
    maxUses?: number; // Default 1 (single-use)
  } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const { expiresInDays = 7, maxUses = 1 } = options;
  
  const token = generatePortalToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data: _data, error } = await supabase
    .from('portal_tokens')
    .insert({
      booking_id: bookingId,
      token,
      expires_at: expiresAt.toISOString(),
      max_uses: maxUses,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create portal token: ${error.message}`);
  }

  return {
    token,
    expiresAt,
  };
}

/**
 * Validate a portal token
 * Returns booking_id if valid, null if invalid
 */
export async function validatePortalToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ bookingId: string | null; isValid: boolean; reason?: string }> {
  // Use RPC function for validation
  const { data, error } = await supabase.rpc('validate_portal_token', {
    p_token: token,
  });

  if (error) {
    console.error('Error validating portal token:', error);
    return { bookingId: null, isValid: false, reason: 'Validation error' };
  }

  if (!data || data.length === 0) {
    return { bookingId: null, isValid: false, reason: 'Token not found' };
  }

  const result = data[0];
  return {
    bookingId: result.booking_id,
    isValid: result.is_valid,
    reason: result.reason,
  };
}

/**
 * Mark a portal token as used
 */
export async function usePortalToken(
  supabase: SupabaseClient,
  token: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('use_portal_token', {
    p_token: token,
  });

  if (error) {
    console.error('Error using portal token:', error);
    return null;
  }

  return data as string | null;
}

/**
 * Get portal URL for a booking
 */
export function getPortalUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/portal/booking?token=${token}`;
}
