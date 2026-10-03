/**
 * Shared Supabase project refs and API helpers for audit scripts.
 */
import { execSync } from "node:child_process";

export const PROJECTS = {
  production: {
    ref: "ifybcfafrwcpptckznpm",
    url: "https://ifybcfafrwcpptckznpm.supabase.co",
  },
  staging: {
    ref: "byfzhyqvtbasxptxdupf",
    url: "https://byfzhyqvtbasxptxdupf.supabase.co",
  },
};

/** Canonical bucket set (production + app expectations). See migration 971. */
export const CANONICAL_BUCKET_IDS = [
  "app-assets",
  "avatars",
  "booking-documents",
  "brand-assets",
  "CMS-IMAGES",
  "custom-request-attachments",
  "explore-posts",
  "grc-evidence",
  "learning-center",
  "merchant-onboarding-documents",
  "message-attachments",
  "product-images",
  "provider-gallery",
  "receipts",
  "reciepts",
  "service-images",
  "verification-documents",
];

export function parseSupabaseCliJson(stdout) {
  const text = String(stdout).trim();
  const start = text.indexOf("[");
  const startObj = text.indexOf("{");
  let jsonText = text;
  if (start >= 0 && (startObj < 0 || start < startObj)) {
    jsonText = text.slice(start);
  } else if (startObj >= 0) {
    jsonText = text.slice(startObj);
  }
  return JSON.parse(jsonText);
}

export function serviceRoleKey(projectRef) {
  const raw = execSync(`supabase projects api-keys --project-ref ${projectRef} -o json`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const keys = parseSupabaseCliJson(raw);
  const row = keys.find((k) => k.id === "service_role" || k.name === "service_role");
  if (!row?.api_key) throw new Error(`No service_role key for ${projectRef}`);
  return row.api_key;
}

export function authHeaders(serviceKey) {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
}

export async function listBuckets(url, serviceKey) {
  const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/bucket`, {
    headers: authHeaders(serviceKey),
  });
  if (!res.ok) throw new Error(`list buckets: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function ensureBucket(url, serviceKey, spec) {
  const buckets = await listBuckets(url, serviceKey);
  if (buckets.some((b) => b.id === spec.id || b.name === spec.id)) return "exists";
  const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(serviceKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: spec.id,
      name: spec.name ?? spec.id,
      public: spec.public ?? false,
      file_size_limit: spec.file_size_limit ?? null,
      allowed_mime_types: spec.allowed_mime_types ?? null,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes("already exists") || res.status === 409) return "exists";
    throw new Error(`create bucket ${spec.id}: ${res.status} ${body}`);
  }
  return "created";
}
