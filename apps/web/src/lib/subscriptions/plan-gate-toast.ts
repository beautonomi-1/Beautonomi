"use client";

import { toast } from "sonner";
import { FetchError } from "@/lib/http/fetcher";
import { isPlanGateErrorCode } from "./subscription-upgrade-copy";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) return error.message?.trim() || fallback;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof FetchError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Toast an API error. Plan-gate codes get a one-tap View plans action.
 * @returns true when the error was a plan gate.
 */
export function toastPlanGateError(error: unknown, fallback: string): boolean {
  const message = errorMessage(error, fallback);
  if (isPlanGateErrorCode(errorCode(error))) {
    toast.error(message, {
      action: {
        label: "View plans",
        onClick: () => {
          window.location.assign("/provider/subscription");
        },
      },
    });
    return true;
  }
  toast.error(message);
  return false;
}
