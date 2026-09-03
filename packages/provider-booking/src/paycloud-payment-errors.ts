export const PAYCLOUD_ERROR_CODES = {
  PAYCLOUD_DISABLED_BY_PLATFORM: "PAYCLOUD_DISABLED_BY_PLATFORM",
  TERMINAL_BUSY: "TERMINAL_BUSY",
  TERMINAL_OFFLINE: "TERMINAL_OFFLINE",
  PAYMENT_DECLINED: "PAYMENT_DECLINED",
  PAYMENT_CANCELLED: "PAYMENT_CANCELLED",
  PAYMENT_TIMEOUT: "PAYMENT_TIMEOUT",
  CONFLICT: "CONFLICT",
} as const;

export type PaycloudErrorCode = (typeof PAYCLOUD_ERROR_CODES)[keyof typeof PAYCLOUD_ERROR_CODES];

export function mapPaycloudPaymentError(
  error: string | null | undefined,
  code?: string | null,
): { message: string; canRetry: boolean; resume?: boolean } {
  switch (code) {
    case PAYCLOUD_ERROR_CODES.PAYCLOUD_DISABLED_BY_PLATFORM:
      return {
        message: "Card machine payments are disabled. Set up PayCloud or choose another method.",
        canRetry: false,
      };
    case PAYCLOUD_ERROR_CODES.TERMINAL_BUSY:
      return {
        message: error || "The terminal is busy. Wait a moment and try again.",
        canRetry: true,
      };
    case PAYCLOUD_ERROR_CODES.TERMINAL_OFFLINE:
      return {
        message: error || "Terminal is offline. Check the device and try again.",
        canRetry: true,
      };
    case PAYCLOUD_ERROR_CODES.PAYMENT_DECLINED:
      return {
        message: error || "Payment was declined on the terminal.",
        canRetry: true,
      };
    case PAYCLOUD_ERROR_CODES.PAYMENT_CANCELLED:
      return {
        message: error || "Payment was cancelled on the terminal.",
        canRetry: true,
      };
    case PAYCLOUD_ERROR_CODES.PAYMENT_TIMEOUT:
      return {
        message: error || "Payment timed out. Check the terminal or retry.",
        canRetry: true,
        resume: true,
      };
    case PAYCLOUD_ERROR_CODES.CONFLICT:
      return {
        message: "This booking changed, reload",
        canRetry: false,
      };
    default:
      return {
        message: error || "Card machine payment could not be completed.",
        canRetry: true,
      };
  }
}
