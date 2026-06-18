import { createHmac, timingSafeEqual } from "crypto";

export interface DeletionCancelTokenPayload {
  userId: string;
  purgeAfterAt: string;
}

function getSecret(): string {
  const s =
    process.env.ACCOUNT_DELETION_LINK_SECRET?.trim() ||
    process.env.RETENTION_LINK_SECRET?.trim();
  if (!s) {
    throw new Error("ACCOUNT_DELETION_LINK_SECRET or RETENTION_LINK_SECRET is not configured");
  }
  return s;
}

function signPayload(userId: string, purgeAfterAt: string): string {
  const secret = getSecret();
  return createHmac("sha256", secret).update(`deletion-cancel|${userId}|${purgeAfterAt}`).digest("base64url");
}

export function buildAccountDeletionCancelUrl(userId: string, purgeAfterAt: string): string {
  const sig = signPayload(userId, purgeAfterAt);
  const payload: DeletionCancelTokenPayload & { sig: string } = {
    userId,
    purgeAfterAt,
    sig,
  };
  const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!origin) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  return `${origin}/api/account-deletion/cancel?t=${encodeURIComponent(token)}`;
}

export function parseDeletionCancelToken(token: string): DeletionCancelTokenPayload | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const data = JSON.parse(json) as DeletionCancelTokenPayload & { sig?: string };
    if (!data.userId || !data.purgeAfterAt || !data.sig) return null;
    const expected = signPayload(data.userId, data.purgeAfterAt);
    const a = Buffer.from(data.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId: data.userId, purgeAfterAt: data.purgeAfterAt };
  } catch {
    return null;
  }
}

export function purgeAfterMatchesStored(stored: string | null | undefined, tokenValue: string): boolean {
  if (!stored) return false;
  return Math.abs(new Date(stored).getTime() - new Date(tokenValue).getTime()) < 3000;
}
