import { createHmac, timingSafeEqual } from "crypto";

const PREFIX = "bn_slack_v1";

function secret(): string {
  const s =
    process.env.SLACK_OAUTH_STATE_SECRET ||
    process.env.SLACK_CLIENT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) {
    throw new Error("SLACK_OAUTH_STATE_SECRET or SLACK_CLIENT_SECRET must be set for Slack OAuth state signing");
  }
  return s;
}

export type SlackOAuthStatePayload = {
  tenantId: string;
  environment: string;
  userId: string;
  redirectAfter?: string;
  exp: number;
};

export function signSlackOAuthState(payload: SlackOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${PREFIX}.${body}.${sig}`;
}

export function verifySlackOAuthState(token: string): SlackOAuthStatePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    const [, body, sig] = parts;
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SlackOAuthStatePayload;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    if (!parsed.tenantId || !parsed.environment || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}
