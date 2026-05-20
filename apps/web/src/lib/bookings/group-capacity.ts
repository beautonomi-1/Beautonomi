export function normalizeGroupCapacity(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === "") return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

export function groupCapacityExceededMessage(max: number): string {
  return `This group booking allows up to ${max} participant${max === 1 ? "" : "s"}.`;
}

export type GroupCapacityCheck =
  | { ok: true; max: number | null; current: number; next: number }
  | { ok: false; max: number; current: number; next: number; message: string; code: "GROUP_CAPACITY_EXCEEDED" };

export function evaluateGroupCapacity(input: {
  maxParticipants: unknown;
  currentParticipants: number;
  adding?: number;
}): GroupCapacityCheck {
  const max = normalizeGroupCapacity(input.maxParticipants);
  const current = Math.max(0, Math.floor(Number(input.currentParticipants) || 0));
  const next = current + Math.max(0, Math.floor(Number(input.adding ?? 0) || 0));

  if (max != null && next > max) {
    return {
      ok: false,
      max,
      current,
      next,
      message: groupCapacityExceededMessage(max),
      code: "GROUP_CAPACITY_EXCEEDED",
    };
  }

  return { ok: true, max, current, next };
}
