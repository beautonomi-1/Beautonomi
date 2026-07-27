import crypto from "node:crypto";

/**
 * RSA2 (SHA256WithRSA) signing per PayCloud API Security docs.
 * Sign string: sorted non-empty top-level params except `sign`, joined with &.
 */
export function buildSignString(params: Record<string, string | number | boolean | undefined | null>): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] != null && params[k] !== "")
    .sort();
  return keys.map((k) => `${k}=${params[k]}`).join("&");
}

function pemMarkers(kind: "PRIVATE" | "PUBLIC", label?: string): { begin: string; end: string } {
  const keyLabel = label ?? `${kind} KEY`;
  return {
    begin: ["-----", "BEGIN ", keyLabel, "-----"].join(""),
    end: ["-----", "END ", keyLabel, "-----"].join(""),
  };
}

/** PEM bodies must wrap at 64 chars; some OpenSSL builds reject a single long line. */
function wrapBase64(body: string): string {
  return (body.replace(/\s+/g, "").match(/.{1,64}/g) ?? []).join("\n");
}

function toPem(kind: "PRIVATE" | "PUBLIC", body: string, label?: string): string {
  const { begin, end } = pemMarkers(kind, label);
  return `${begin}\n${wrapBase64(body)}\n${end}`;
}

/** Attempt PKCS#8 then PKCS#1 for bare base64 keys. */
export function normalizePrivateKeyPem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN")) return trimmed;

  const pkcs8 = toPem("PRIVATE", trimmed);
  try {
    crypto.createPrivateKey(pkcs8);
    return pkcs8;
  } catch {
    const pkcs1 = toPem("PRIVATE", trimmed, "RSA PRIVATE KEY");
    crypto.createPrivateKey(pkcs1);
    return pkcs1;
  }
}

export function validatePrivateKeyPem(key: string): { ok: true } | { ok: false; message: string } {
  try {
    crypto.createPrivateKey(normalizePrivateKeyPem(key));
    return { ok: true };
  } catch {
    return { ok: false, message: "App RSA private key is invalid. Paste PKCS#1 or PKCS#8 PEM." };
  }
}

export function validatePublicKeyPem(key: string): { ok: true } | { ok: false; message: string } {
  try {
    crypto.createPublicKey(formatPublicKeyPem(key));
    return { ok: true };
  } catch {
    return { ok: false, message: "Gateway RSA public key is invalid." };
  }
}

export function signWithPrivateKey(signString: string, privateKeyPem: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signString, "utf8");
  return signer.sign(normalizePrivateKeyPem(privateKeyPem), "base64");
}

export function verifyWithPublicKey(
  signString: string,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signString, "utf8");
    return verifier.verify(publicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}

export function formatPrivateKeyPem(key: string): string {
  if (key.includes("BEGIN")) return key;
  return normalizePrivateKeyPem(key);
}

export function formatPublicKeyPem(key: string): string {
  if (key.includes("BEGIN")) return key;
  return toPem("PUBLIC", key);
}
