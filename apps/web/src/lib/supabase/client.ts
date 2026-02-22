/**
 * Supabase Browser Client
 * 
 * Use this for client-side operations in authenticated pages.
 * For server-side operations, use the server client.
 * 
 * This client uses cookie-based session management for proper SSR support.
 * The createBrowserClient from @supabase/ssr automatically handles cookies.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseClient() {
  // Use singleton pattern but ensure it reads cookies properly
  if (!clientInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder';
    
    // Only create client if we have valid-looking values
    if (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') {
      // createBrowserClient from @supabase/ssr automatically handles cookies
      // It reads from document.cookie and writes cookies properly
      clientInstance = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
    } else {
      // Create with placeholder values to prevent errors
      clientInstance = createBrowserClient<Database>(
        'https://placeholder.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'
      );
    }
  }
  return clientInstance;
}
