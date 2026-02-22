/**
 * Supabase Database Types
 *
 * Generated via: npx supabase gen types typescript --project-id <id> > src/database.ts
 * Until then, placeholder for compatibility.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
