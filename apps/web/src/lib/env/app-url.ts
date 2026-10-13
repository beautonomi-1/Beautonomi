/**
 * Canonical public app base URL for payment links, emails, and callbacks.
 */
export function getAppBaseUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const vercel = (process.env.VERCEL_URL || "").replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL is required in production");
  }

  return "https://beautonomi.com";
}
