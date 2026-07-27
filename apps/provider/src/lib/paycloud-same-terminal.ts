import { NativeModules, Platform } from "react-native";
import type {
  PaycloudDeviceInfo,
  PaycloudDeviceSerialSource,
  PaycloudIntentContract,
  PaycloudIntentPayload,
  PaycloudIntentResult,
  PaycloudIntentTransDataResult,
} from "@beautonomi/paycloud-same-terminal";

export type {
  PaycloudDeviceInfo,
  PaycloudDeviceSerialSource,
  PaycloudIntentContract,
  PaycloudIntentPayload,
  PaycloudIntentResult,
  PaycloudIntentTransDataResult,
};

const NativePaycloudSameTerminal = NativeModules.PaycloudSameTerminal as
  | {
      canLaunch(): Promise<boolean>;
      getDeviceSerial(): Promise<string | null>;
      getDeviceInfo(): Promise<PaycloudDeviceInfo>;
      preInit(payload: Pick<PaycloudIntentPayload, "version" | "appId" | "intent_contract">): Promise<PaycloudIntentResult>;
      startSale(payload: PaycloudIntentPayload): Promise<PaycloudIntentResult>;
    }
  | undefined;

/** Human-friendly messages for WiseCashier same-terminal Intent result codes. */
const INTENT_RESULT_MESSAGES: Record<string, string> = {
  "00": "Payment approved",
  K026: "Payment cancelled on the card machine",
  K027: "Payment timed out — try again",
  M016: "Duplicate order number — start a new payment",
  M002: "Invalid payment details — check amount and try again",
  M003: "Invalid amount",
  M007: "This payment type is not supported on this device",
  M008: "Payment app version mismatch — contact support",
  J000: "Network error — check connection and try again",
  J001: "Network error — cannot reach payment server",
  J002: "Network connection timed out",
  J003: "Network connection failed",
  G003: "PIN entry cancelled",
  G004: "PIN entry timed out",
  C009: "Card read timed out — try again",
  Q004: "Card machine is not fully configured — contact support",
  Q007: "Card machine configuration error — contact support",
};

export function humanizePaycloudIntentResult(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (!code) return fallback?.trim() || "Payment did not complete — try again";
  return INTENT_RESULT_MESSAGES[code] ?? fallback?.trim() ?? `Payment error (${code})`;
}

export function isPaycloudIntentApproved(result: PaycloudIntentResult | null | undefined): boolean {
  return result?.result === "00" || (result?.success === true && result?.result == null);
}

export function parsePaycloudIntentTransData(
  raw: PaycloudIntentResult["transData"],
): PaycloudIntentTransDataResult | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      transactionID:
        typeof parsed.transactionID === "string" ? parsed.transactionID : undefined,
      refNo: typeof parsed.refNo === "string" ? parsed.refNo : undefined,
      authCode: typeof parsed.authCode === "string" ? parsed.authCode : undefined,
      cardNo: typeof parsed.cardNo === "string" ? parsed.cardNo : undefined,
      transDate: typeof parsed.transDate === "string" ? parsed.transDate : undefined,
      transTime: typeof parsed.transTime === "string" ? parsed.transTime : undefined,
      amt: typeof parsed.amt === "string" ? parsed.amt : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Same-terminal WiseCashier Intent bridge (Android Wiseasy terminals).
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

/** Best-effort device serial for same-terminal validation. */
export async function getPaycloudDeviceSerial(): Promise<string | null> {
  const info = await getPaycloudDeviceInfo();
  return info.serial;
}

/** Device identity across the Wiseasy fleet (serial source varies by model). */
export async function getPaycloudDeviceInfo(): Promise<PaycloudDeviceInfo> {
  const empty: PaycloudDeviceInfo = {
    serial: null,
    manufacturer: null,
    model: null,
    serialSource: null,
  };
  if (Platform.OS !== "android") return empty;
  try {
    if (NativePaycloudSameTerminal?.getDeviceInfo) {
      const info = await NativePaycloudSameTerminal.getDeviceInfo();
      return {
        serial: info.serial ?? null,
        manufacturer: info.manufacturer ?? null,
        model: info.model ?? null,
        serialSource: info.serialSource ?? null,
      };
    }
    if (NativePaycloudSameTerminal?.getDeviceSerial) {
      const serial = await NativePaycloudSameTerminal.getDeviceSerial();
      return { ...empty, serial: serial ?? null, serialSource: serial ? "build_serial" : null };
    }
  } catch {
    /* fall through */
  }
  return empty;
}

export async function preInitPaycloudSameTerminal(
  payload: Pick<PaycloudIntentPayload, "version" | "appId" | "intent_contract">,
): Promise<PaycloudIntentResult> {
  if (!NativePaycloudSameTerminal?.preInit) {
    return {
      success: false,
      message: "Pay on this device is not available on this build yet.",
    };
  }
  return NativePaycloudSameTerminal.preInit(payload);
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
  const result = await NativePaycloudSameTerminal.startSale(payload);
  if (!result.message && (result.result || result.resultMsg)) {
    return {
      ...result,
      message: humanizePaycloudIntentResult(result.result, result.resultMsg),
    };
  }
  return result;
}
