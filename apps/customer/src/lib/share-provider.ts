import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";

const CUSTOMER_SCHEME = "customer://";

export type ShareProviderInput = {
  businessName: string;
  slug: string;
  /** Universal link / web URL base (tenant-aware) */
  webBaseUrl: string;
  description?: string | null;
  topCategory?: string | null;
  ratingAverage?: number | null;
  reviewCount?: number | null;
  distanceKm?: number | null;
};

function buildWebUrl(base: string, slug: string): string {
  const b = base.replace(/\/$/, "");
  return `${b}/partner-profile?slug=${encodeURIComponent(slug)}`;
}

function buildAppUrl(slug: string): string {
  return `${CUSTOMER_SCHEME}partner-profile?slug=${encodeURIComponent(slug)}`;
}

/**
 * Share a provider using platform-appropriate title/message and both web + app links on native.
 */
export async function shareProvider(opts: ShareProviderInput): Promise<void> {
  const { businessName, slug, webBaseUrl, description, topCategory, ratingAverage, reviewCount, distanceKm } =
    opts;
  const web = buildWebUrl(webBaseUrl, slug);
  const lines: string[] = [`${businessName} on Beautonomi`];
  const tagline = description?.trim() || topCategory?.trim();
  if (tagline) lines.push(tagline);
  if (ratingAverage != null && Number.isFinite(ratingAverage) && (reviewCount ?? 0) > 0) {
    lines.push(`★ ${Number(ratingAverage).toFixed(1)} (${reviewCount} reviews)`);
  } else if (ratingAverage != null && Number.isFinite(ratingAverage)) {
    lines.push(`★ ${Number(ratingAverage).toFixed(1)}`);
  }
  if (distanceKm != null && Number.isFinite(distanceKm) && distanceKm >= 0) {
    lines.push(`~${distanceKm.toFixed(1)} km away`);
  }
  lines.push(web);
  if (Platform.OS !== "web") {
    lines.push(`Open in app: ${buildAppUrl(slug)}`);
  }
  const message = lines.join("\n");

  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: businessName, text: message, url: web });
      return;
    }
    await Share.share(
      Platform.OS === "ios"
        ? { message, url: web }
        : { message, title: businessName },
    );
  } catch {
    /* user cancelled or share sheet failed */
  }
}

/** Open the in-app partner profile via deep link (native only). */
export function openProviderInApp(slug: string): void {
  if (Platform.OS === "web") return;
  const url = buildAppUrl(slug);
  void Linking.openURL(url);
}
