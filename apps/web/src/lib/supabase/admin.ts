/**
 * Supabase Admin (Service Role) Client
 *
 * Use this ONLY in trusted server contexts (e.g. payment webhooks) where there is no user session.
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type JwtPayload = { role?: string; ref?: string };

function decodeJwtPayload(apiKey: string): JwtPayload | null {
  try {
    const segment = apiKey.split(".")[1];
    if (!segment) return null;
    const json = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function expectedProjectRef(supabaseUrl: string): string | null {
  try {
    return new URL(supabaseUrl.trim()).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function isValidServiceRoleKey(apiKey: string, supabaseUrl: string): boolean {
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length > 400) return false;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) > 255) return false;
  }
  const payload = decodeJwtPayload(trimmed);
  if (payload?.role !== "service_role") return false;
  const ref = expectedProjectRef(supabaseUrl);
  if (ref && payload.ref && payload.ref !== ref) return false;
  return true;
}

/** Dev-only: parent shells (IDE/CLI) sometimes inject a stale SUPABASE_SERVICE_ROLE_KEY. */
function readServiceRoleFromEnvLocal(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  try {
    const envPath = join(process.cwd(), ".env.local");
    const text = readFileSync(envPath, "utf8");
    const match = text.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

function resolveServiceRoleKey(supabaseUrl: string): string {
  const fromProcess = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromProcess && isValidServiceRoleKey(fromProcess, supabaseUrl)) {
    return fromProcess;
  }

  const fromFile = readServiceRoleFromEnvLocal();
  if (fromFile && isValidServiceRoleKey(fromFile, supabaseUrl)) {
    return fromFile;
  }

  if (fromProcess) {
    const payload = decodeJwtPayload(fromProcess);
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY is invalid for ${supabaseUrl} (JWT role=${payload?.role ?? "unknown"}, ref=${payload?.ref ?? "unknown"}). ` +
        "Use the service_role secret from the same Supabase project as NEXT_PUBLIC_SUPABASE_URL — not the anon key and not a production key.",
    );
  }

  throw new Error("Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY)");
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    throw new Error("Supabase admin client not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }

  const serviceKey = resolveServiceRoleKey(supabaseUrl);

  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
