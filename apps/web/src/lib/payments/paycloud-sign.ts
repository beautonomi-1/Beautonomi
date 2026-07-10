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

export function signWithPrivateKey(signString: string, privateKeyPem: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signString, "utf8");
  return signer.sign(privateKeyPem, "base64");
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
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
}

export function formatPublicKeyPem(key: string): string {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}
