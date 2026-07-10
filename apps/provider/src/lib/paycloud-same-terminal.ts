import { NativeModules, Platform } from "react-native";

export type PaycloudIntentPayload = {
  merchant_order_no: string;
  order_amount: string;
  price_currency: string;
  pay_scenario: string;
  pay_method_id?: string;
  trans_type?: number;
  tip_amount?: string;
  cashback_amount?: string;
};

export type PaycloudIntentResult = {
  success: boolean;
  trans_status?: string;
  message?: string;
};

const NativePaycloudSameTerminal = NativeModules.PaycloudSameTerminal as
  | {
      canLaunch(): Promise<boolean>;
      startSale(payload: PaycloudIntentPayload): Promise<PaycloudIntentResult>;
    }
  | undefined;

/**
 * Same-terminal WiseCashier Intent bridge (Android P5/P5L).
 * Returns false / throws until native module is wired after hardware spike.
 */
export async function canLaunchPaycloudSameTerminal(): Promise<boolean> {
  if (Platform.OS !== "android" || !NativePaycloudSameTerminal?.canLaunch) return false;
  try {
    return await NativePaycloudSameTerminal.canLaunch();
  } catch {
    return false;
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
