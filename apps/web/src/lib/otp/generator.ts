/**
 * OTP Generation and Validation Utilities
 * 
 * Generates 6-digit OTP codes for booking arrival verification
 */

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

/**
 * Generate a random 6-digit OTP
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  const expiryDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return new Date() > expiryDate;
}

/**
 * Validate OTP format (6 digits)
 */
export function isValidOTPFormat(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}

/**
 * Format OTP for display (adds space in middle: 123 456)
 */
export function formatOTP(otp: string): string {
  if (otp.length !== OTP_LENGTH) return otp;
  return `${otp.slice(0, 3)} ${otp.slice(3)}`;
}
