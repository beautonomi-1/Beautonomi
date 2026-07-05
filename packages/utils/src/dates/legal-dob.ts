/** Month labels for selection-based DOB pickers (1-indexed keys). */
export const LEGAL_DOB_MONTHS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export interface LegalDobParts {
  day: number | null;
  month: number | null;
  year: number | null;
}

export function parseLegalDobIso(iso: string | null | undefined): LegalDobParts {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { day: null, month: null, year: null };
  }
  const [y, m, d] = iso.split("-").map(Number);
  return { day: d, month: m, year: y };
}

export function composeLegalDobIso(parts: LegalDobParts): string {
  if (parts.day == null || parts.month == null || parts.year == null) return "";
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function legalDobYearRange(opts?: {
  minAge?: number;
  maxAge?: number;
  now?: Date;
}): number[] {
  const now = opts?.now ?? new Date();
  const minAge = opts?.minAge ?? 18;
  const maxAge = opts?.maxAge ?? 100;
  const latestBirthYear = now.getFullYear() - minAge;
  const earliestBirthYear = now.getFullYear() - maxAge;
  const years: number[] = [];
  for (let y = latestBirthYear; y >= earliestBirthYear; y--) {
    years.push(y);
  }
  return years;
}

export function validateLegalDobParts(
  parts: LegalDobParts,
  opts?: { minAge?: number; now?: Date },
): string | null {
  if (parts.day == null || parts.month == null || parts.year == null) {
    return "Date of birth is required";
  }
  const { day, month, year } = parts;
  if (month < 1 || month > 12) return "Select a valid month";
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return "Select a valid day for this month";
  const iso = composeLegalDobIso(parts);
  const dob = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return "Enter a valid date of birth";
  const now = opts?.now ?? new Date();
  if (dob >= now) return "Date of birth must be in the past";
  const minAge = opts?.minAge ?? 18;
  const minBirth = new Date(now);
  minBirth.setFullYear(now.getFullYear() - minAge);
  if (dob > minBirth) return `You must be at least ${minAge} years old`;
  return null;
}

export function formatLegalDobDisplay(iso: string | null | undefined): string {
  const parts = parseLegalDobIso(iso);
  if (parts.day == null || parts.month == null || parts.year == null) return "";
  const monthLabel = LEGAL_DOB_MONTHS.find((m) => m.value === parts.month)?.label ?? String(parts.month);
  return `${parts.day} ${monthLabel} ${parts.year}`;
}
