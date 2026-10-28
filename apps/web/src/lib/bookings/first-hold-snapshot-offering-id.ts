export function firstHoldSnapshotOfferingId(snapshot: unknown): string {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return "";
  const first = snapshot[0];
  if (!first || typeof first !== "object") return "";
  const offeringId = (first as { offering_id?: unknown }).offering_id;
  if (typeof offeringId !== "string") return "";
  return offeringId.trim();
}
