import { createHmac, timingSafeEqual } from "crypto";

export interface RetentionTokenPayload {
  userId: string;
  scheduledArchiveAt: string;
}

function getSecret(): string {
  const s = process.env.RETENTION_LINK_SECRET?.trim();
  if (!s) {
    throw new Error("RETENTION_LINK_SECRET is not configured");
  }
  return s;
}

function signPayload(userId: string, scheduledArchiveAt: string): string {
  const secret = getSecret();
  return createHmac("sha256", secret).update(`${userId}|${scheduledArchiveAt}`).digest("base64url");
}

/**
 * Build signed URL for email/push. `scheduledArchiveAt` must match `users.scheduled_data_archive_at` (ISO).
 */
export function buildRetentionKeepActiveUrl(userId: string, scheduledArchiveAt: string): string {
  const sig = signPayload(userId, scheduledArchiveAt);
  const payload: RetentionTokenPayload & { sig: string } = {
    userId,
    scheduledArchiveAt,
    sig,
  };
  const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!origin) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  return `${origin}/api/retention/keep-active?t=${encodeURIComponent(token)}`;
}

export function parseRetentionToken(token: string): RetentionTokenPayload | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const data = JSON.parse(json) as RetentionTokenPayload & { sig?: string };
    if (!data.userId || !data.scheduledArchiveAt || !data.sig) return null;
    const expected = signPayload(data.userId, data.scheduledArchiveAt);
    const a = Buffer.from(data.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId: data.userId, scheduledArchiveAt: data.scheduledArchiveAt };
  } catch {
    return null;
  }
}
