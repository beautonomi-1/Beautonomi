import { fetcher } from "@/lib/http/fetcher";
import { PENDING_MARKETING_CONSENT_KEY } from "@/lib/auth/persist-marketing-consent";

export async function submitMarketingConsent(consented: boolean): Promise<void> {
  try {
    await fetcher.post("/api/auth/consent", { marketing_consent: consented });
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PENDING_MARKETING_CONSENT_KEY);
    }
  } catch {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PENDING_MARKETING_CONSENT_KEY, consented ? "1" : "0");
    }
  }
}

export function readPendingMarketingConsent(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_MARKETING_CONSENT_KEY);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}
