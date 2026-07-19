import { NativeModules, Platform } from "react-native";
import type {
  PaycloudIntentContract,
  PaycloudIntentPayload,
  PaycloudIntentResult,
} from "@beautonomi/paycloud-same-terminal";

export type { PaycloudIntentContract, PaycloudIntentPayload, PaycloudIntentResult };

const NativePaycloudSameTerminal = NativeModules.PaycloudSameTerminal as
  | {
      canLaunch(): Promise<boolean>;
      getDeviceSerial(): Promise<string | null>;
      startSale(payload: PaycloudIntentPayload): Promise<PaycloudIntentResult>;
    }
  | undefined;

/**
 * Same-terminal WiseCashier Intent bridge (Android P5/P5L).
 * Returns false when WiseCashier is not installed (e.g. provider phone).
 */
export async function canLaunchPaycloudSameTerminal(): Promise<boolean> {
  if (Platform.OS !== "android" || !NativePaycloudSameTerminal?.canLaunch) return false;
  try {
    return await NativePaycloudSameTerminal.canLaunch();
  } catch {
    return false;
  }
}

/** Best-effort device serial for same-terminal terminal_sn validation. */
export async function getPaycloudDeviceSerial(): Promise<string | null> {
  if (Platform.OS !== "android" || !NativePaycloudSameTerminal?.getDeviceSerial) return null;
  try {
    return await NativePaycloudSameTerminal.getDeviceSerial();
  } catch {
    return null;
  }
}

export async function startPaycloudSameTerminalSale(
  payload: PaycloudIntentPayload,
): Promise<PaycloudIntentResult> {
  if (!NativePaycloudSameTerminal?.startSale) {
    return {
      success: false,
      message: "Pay on this device is not available on this build yet.",
    };
  }
  return NativePaycloudSameTerminal.startSale(payload);
}
