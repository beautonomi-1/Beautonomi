/** F2-69: last-4 only. Never log a raw phone number. */
export function redactPhoneForLog(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "[redacted]";
  return `***${digits.slice(-4)}`;
}
