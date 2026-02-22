/**
 * QR Code Generation and Validation Utilities
 * 
 * Generates QR codes for booking verification as a fallback when OTP is not enabled
 */

import QRCode from "qrcode";

export interface QRCodeData {
  booking_id: string;
  booking_number: string;
  verification_code: string;
  expires_at: string;
  type: "arrival_verification" | "service_completion";
}

/**
 * Generate a verification code (similar to OTP but for QR codes)
 */
export function generateVerificationCode(): string {
  // Generate 8-character alphanumeric code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing characters
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Calculate QR code expiry timestamp (15 minutes for QR codes)
 */
export function getQRCodeExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 15); // QR codes valid for 15 minutes
  return expiry;
}

/**
 * Check if QR code is expired
 */
export function isQRCodeExpired(expiresAt: string | Date): boolean {
  const expiryDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return new Date() > expiryDate;
}

/**
 * Generate QR code as data URL (for display in img tag)
 */
export async function generateQRCodeDataURL(data: QRCodeData): Promise<string> {
  try {
    const jsonData = JSON.stringify(data);
    const dataURL = await QRCode.toDataURL(jsonData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return dataURL;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(data: QRCodeData): Promise<string> {
  try {
    const jsonData = JSON.stringify(data);
    const svg = await QRCode.toString(jsonData, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return svg;
  } catch (error) {
    console.error("Error generating QR code SVG:", error);
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Parse QR code data from scanned result
 */
export function parseQRCodeData(scannedData: string): QRCodeData | null {
  try {
    const data = JSON.parse(scannedData);
    // Validate required fields
    if (data.booking_id && data.booking_number && data.verification_code && data.expires_at && data.type) {
      return data as QRCodeData;
    }
    return null;
  } catch (error) {
    console.error("Error parsing QR code data:", error);
    return null;
  }
}

/**
 * Validate QR code data
 */
export function validateQRCodeData(data: QRCodeData, bookingId: string): boolean {
  if (data.booking_id !== bookingId) {
    return false;
  }
  if (isQRCodeExpired(data.expires_at)) {
    return false;
  }
  return true;
}
