/**
 * §15.4 (audit 2026-04) — Server-side idempotency key helper.
 *
 * Usage:
 *   const key = extractIdempotencyKey(request);
 *   if (key) {
 *     const cached = await lookupIdempotentResponse(endpoint, key);
 *     if (cached) return cached.toResponse();
 *   }
 *   // ... do work ...
 *   if (key) await rememberIdempotentResponse(endpoint, key, { status: 200, body });
 *
 * Rules:
 *   - Key comes from the `Idempotency-Key` request header, falling back to
 *     the `idempotency_key` JSON body field if the caller prefers JSON.
 *   - Keys must be valid UUIDv4 to prevent attackers from collision-spraying
 *     the table. Anything else is treated as "no key provided".
 *   - Cached responses live in `public.request_idempotency_keys` for 24h
 *     (enforced by the default `expires_at`). The daily cron
 *     `/api/cron/prune-idempotency-keys` deletes expired rows.
 *   - Consumers MUST scope the key by endpoint string so the same UUID can
 *     be reused across different routes without collisions.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractIdempotencyKey(
  request: NextRequest,
  bodyJson?: unknown,
): string | null {
  const headerKey = request.headers.get("idempotency-key")?.trim();
  if (headerKey && UUID_RE.test(headerKey)) return headerKey.toLowerCase();

  if (bodyJson && typeof bodyJson === "object") {
    const maybe = (bodyJson as Record<string, unknown>).idempotency_key;
    if (typeof maybe === "string" && UUID_RE.test(maybe.trim())) {
      return maybe.trim().toLowerCase();
    }
  }
  return null;
}

export interface CachedIdempotentResponse {
  status: number;
  body: unknown;
  toResponse: () => Response;
}

/**
 * F2-70: a cached response stored under another user must not replay.
 * Anonymous rows (user_id null) may replay — the key is an unguessable UUID.
 * A signed-in caller's key must match the stored user_id when it is set.
 */
export function idempotencyBelongsToCaller(
  rowUserId: string | null | undefined,
  callerUserId: string | null | undefined,
): boolean {
  if (rowUserId) {
    return Boolean(callerUserId) && rowUserId === callerUserId;
  }
  return true;
}

/** F2-70: unique is (endpoint, key) — a mismatch must 409, not miss-and-recharge. */
export function idempotencyConflictCachedResponse(): CachedIdempotentResponse {
  const body = {
    success: false,
    error: {
      code: "IDEMPOTENCY_KEY_CONFLICT",
      message: "Idempotency key already used",
    },
  };
  return {
    status: 409,
    body,
    toResponse: () =>
      NextResponse.json(body, {
        status: 409,
        headers: { "Idempotent-Replay": "conflict" },
      }),
  };
}

export async function lookupIdempotentResponse(
  endpoint: string,
  key: string,
  opts?: { userId?: string | null },
): Promise<CachedIdempotentResponse | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("request_idempotency_keys")
      .select("response_status, response_body, expires_at, user_id")
      .eq("endpoint", endpoint)
      .eq("idempotency_key", key)
      .maybeSingle();

    if (!data) return null;
    if (!idempotencyBelongsToCaller(
      (data as { user_id?: string | null }).user_id,
      opts?.userId,
    )) {
      return idempotencyConflictCachedResponse();
    }

    // Treat an expired row as "not found" even if prune hasn't run yet.
    const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (expires > 0 && expires < Date.now()) return null;

    const status =
      typeof data.response_status === "number" && data.response_status > 0
        ? data.response_status
        : 200;
    const body = data.response_body ?? null;
    return {
      status,
      body,
      toResponse: () =>
        NextResponse.json(body as Record<string, unknown> | unknown[] | null, {
          status,
          headers: { "Idempotent-Replay": "true" },
        }),
    };
  } catch (err) {
    console.warn("[idempotency] lookup failed:", err);
    return null;
  }
}

export async function rememberIdempotentResponse(
  endpoint: string,
  key: string,
  opts: {
    status: number;
    body: unknown;
    tenantId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin
      .from("request_idempotency_keys")
      .insert({
        endpoint,
        idempotency_key: key,
        tenant_id: opts.tenantId ?? null,
        user_id: opts.userId ?? null,
        response_status: opts.status,
        response_body: opts.body ?? null,
      });
  } catch (err) {
    // Best-effort: never fail the real request because we couldn't cache.
    console.warn("[idempotency] remember failed:", err);
  }
}
