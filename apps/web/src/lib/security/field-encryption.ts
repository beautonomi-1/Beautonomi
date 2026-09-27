import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function keyMaterial(): Buffer {
  const secret =
    process.env.PAYROLL_FIELD_ENCRYPTION_KEY ||
    process.env.INTERNAL_API_SECRET ||
    process.env.CRON_SECRET ||
    "";
  if (!secret) {
    throw new Error("PAYROLL_FIELD_ENCRYPTION_KEY (or INTERNAL_API_SECRET) is required");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSensitiveField(plaintext: string): string {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSensitiveField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv(ALGO, keyMaterial(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
