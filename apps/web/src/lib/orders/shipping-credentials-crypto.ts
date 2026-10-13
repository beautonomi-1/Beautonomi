import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Whether salon-owned courier credentials can be stored (web env; never exposes the key). */
export function isShippingCredentialsEncryptionConfigured(): boolean {
  const raw = (process.env.SHIPPING_CREDENTIALS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return false;
  try {
    return Buffer.from(raw, "base64").length === 32;
  } catch {
    return false;
  }
}

function encryptionKey(): Buffer {
  const raw = (process.env.SHIPPING_CREDENTIALS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error("SHIPPING_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SHIPPING_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return key;
}

export function encryptCredentialsPayload(payload: Record<string, unknown>): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptCredentialsPayload<T extends Record<string, unknown>>(blob: string): T {
  const key = encryptionKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 12 + 16 + 1) {
    throw new Error("Invalid credentials ciphertext");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function maskSecretHint(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const t = value.trim();
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
