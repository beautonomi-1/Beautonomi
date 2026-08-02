"use client";

/**
 * Detects a native PayCloud same-terminal bridge injected by the provider app
 * WebView (WiseCashier Intent). Desktop browsers never expose this.
 */
export type PaycloudSameTerminalBridge = {
  canLaunch: () => Promise<boolean>;
  getDeviceSerial?: () => Promise<string | null>;
  startSale: (payload: Record<string, unknown>) => Promise<{
    result?: string | null;
    success?: boolean;
    message?: string | null;
    resultMsg?: string | null;
    transData?: unknown;
  }>;
};

declare global {
  interface Window {
    BeautonomiPaycloud?: {
      sameTerminal?: PaycloudSameTerminalBridge;
    };
  }
}

export function getPaycloudSameTerminalBridge(): PaycloudSameTerminalBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.BeautonomiPaycloud?.sameTerminal;
  if (!bridge || typeof bridge.canLaunch !== "function" || typeof bridge.startSale !== "function") {
    return null;
  }
  return bridge;
}

export async function canUsePaycloudSameTerminalOnWeb(): Promise<boolean> {
  const bridge = getPaycloudSameTerminalBridge();
  if (!bridge) return false;
  try {
    return Boolean(await bridge.canLaunch());
  } catch {
    return false;
  }
}
