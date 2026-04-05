import { Platform, Share } from "react-native";
import { APP_URL } from "@/config/public-env";

/** Share a marketplace product link (web URL when APP_URL is set). */
export async function shareMarketplaceProduct(opts: { id: string; name: string }): Promise<void> {
  const base = (APP_URL || "").replace(/\/$/, "");
  const url = base ? `${base}/shop?product=${encodeURIComponent(opts.id)}` : "";
  const message = url ? `${opts.name}\n${url}` : opts.name;
  try {
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({
        title: opts.name,
        text: message,
        ...(url ? { url } : {}),
      });
      return;
    }
    if (Platform.OS === "ios" && url) {
      await Share.share({ message: opts.name, url });
    } else {
      await Share.share({ message, title: opts.name });
    }
  } catch {
    // dismissed
  }
}
