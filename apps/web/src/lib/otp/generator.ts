/**
 * OTP Generation and Validation Utilities
 *
 * Generates 4- or 6-digit PIN codes for booking arrival verification (crypto-safe).
 */

import { randomInt } from "crypto";

const OTP_EXPIRY_MINUTES = 10;
export const OTP_LENGTH_6 = 6;
export const OTP_LENGTH_4 = 4;

/** Default length for arrival PIN (4 = Uber-style, easy to say at door) */
const DEFAULT_PIN_LENGTH = 4;

/**
 * Generate a cryptographically random PIN (4 or 6 digits).
 * @param length 4 or 6 (default 4)
 */
export function generateOTP(length: number = DEFAULT_PIN_LENGTH): string {
  if (length === 4) {
    return randomInt(1000, 10000).toString();
  }
  return randomInt(100000, 1000000).toString();
}

/**
 * Calculate OTP expiry timestamp
 */
export function getOTPExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
  return expiry;
}

/**
 * Check if OTP is expired
 */
export function isOTPExpired(expiresAt: string | Date): boolean {
  const expiryDate = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return new Date() > expiryDate;
}

/**
 * Validate PIN format (4 or 6 digits)
 */
export function isValidOTPFormat(otp: string): boolean {
  return /^\d{4}$/.test(otp) || /^\d{6}$/.test(otp);
}

/**
 * Format PIN for display (4: "12 34", 6: "123 456")
 */
export function formatOTP(otp: string): string {
  const digits = otp.replace(/\D/g, "");
  if (digits.length === 4) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return otp;
}
