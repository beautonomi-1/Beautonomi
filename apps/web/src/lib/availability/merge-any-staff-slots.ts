import type { TimeSlot } from "./types";

/**
 * Union "any staff" availability: a slot time is bookable if **any** staff has it available.
 * Assumes each array uses the same `date` + `duration` + `slotInterval` grid so `time` keys align.
 */
export function mergeUnionAnyStaffSlots(slotArrays: TimeSlot[][]): TimeSlot[] {
  if (slotArrays.length === 0) return [];
  const byTime = new Map<string, TimeSlot>();

  for (const slots of slotArrays) {
    for (const s of slots) {
      const key = s.time;
      const prev = byTime.get(key);
      if (!prev) {
        byTime.set(key, { ...s });
        continue;
      }
      if (s.available || prev.available) {
        byTime.set(key, {
          time: key,
          available: true,
        });
      } else {
        byTime.set(key, {
          time: key,
          available: false,
          reason: prev.reason ?? s.reason,
        });
      }
    }
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}
