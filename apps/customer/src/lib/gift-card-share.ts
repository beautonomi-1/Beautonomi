import { Alert, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { formatMoney } from "@beautonomi/utils";
import { haptic } from "@/lib/haptics";

const BRAND_NAME = "Beautonomi";
const DOWNLOAD_URL = "https://beautonomi.com";

/** Copy a gift card code to the clipboard with haptic + optional toast callback. */
export async function copyGiftCardCode(code: string, onCopied?: () => void): Promise<void> {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return;
  try {
    await Clipboard.setStringAsync(trimmed);
    haptic.success();
    onCopied?.();
  } catch {
    Alert.alert(
      "Couldn't copy",
      "We couldn't copy the code automatically. Press and hold the code to copy it manually.",
    );
  }
}

/**
 * Share a gift card via the native share sheet. The message contains the code,
 * value, and clear redemption guidance so a recipient can use it immediately —
 * matching how global gift card platforms deliver a shareable, self-explanatory
 * payload.
 */
export async function shareGiftCard(params: {
  code: string;
  balance?: number;
  currency?: string;
  expiresAt?: string | null;
}): Promise<void> {
  const code = (params.code ?? "").trim();
  if (!code) return;

  const valueLine =
    params.balance != null && params.currency
      ? `Value: ${formatMoney(Number(params.balance), params.currency)}\n`
      : "";

  let expiryLine = "";
  if (params.expiresAt) {
    const parsed = new Date(params.expiresAt);
    if (Number.isFinite(parsed.getTime())) {
      expiryLine = `Valid until: ${parsed.toLocaleDateString()}\n`;
    }
  }

  const message =
    `🎁 You've received a ${BRAND_NAME} gift card!\n\n` +
    `Gift card code: ${code}\n` +
    valueLine +
    expiryLine +
    `\nHow to redeem: open the ${BRAND_NAME} app, go to Wallet → Gift Card, and enter the code ` +
    `to add it to your wallet — or apply it at checkout.\n` +
    `Get the app: ${DOWNLOAD_URL}`;

  try {
    haptic.light();
    await Share.share({ message, title: `${BRAND_NAME} gift card` });
  } catch {
    // User dismissed the share sheet or sharing is unavailable — no-op.
  }
}
