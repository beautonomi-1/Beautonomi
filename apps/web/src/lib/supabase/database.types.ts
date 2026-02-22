/**
 * Supabase Database Types
 * 
 * These types provide IntelliSense for Supabase queries.
 * To regenerate from your live schema, run:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/database.types.ts
 * 
 * The types below are manually maintained to match the current schema.
 * Using an untyped schema (`any`) as a fallback because the repo has many
 * tables; if this file is incomplete, Supabase query builders collapse to
 * `never` and break builds.
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
