import { createHash } from "node:crypto";

export type ExploreFeedFilterFingerprintInput = {
  sortMode: string;
  followingOnly: boolean;
  categorySlug: string | null;
  filterTags: string[] | null;
  searchQuery: string | null;
  lat: string | null;
  lng: string | null;
  radiusKm: number;
  city: string | null;
};

export function buildExploreFeedFilterFingerprint(input: ExploreFeedFilterFingerprintInput): string {
  const payload = JSON.stringify({
    sort: input.sortMode,
    following: input.followingOnly,
    category: input.categorySlug ?? "",
    tags: (input.filterTags ?? []).slice().sort().join(","),
    search: input.searchQuery ?? "",
    lat: input.lat ?? "",
    lng: input.lng ?? "",
    radius_km: input.radiusKm,
    city: input.city ?? "",
  });
  return createHash("sha256").update(payload).digest("base64url").slice(0, 16);
}

export function cursorFingerprintMatches(
  cursorFp: string | undefined,
  currentFp: string,
): boolean {
  if (!cursorFp) return true;
  return cursorFp === currentFp;
}

export type ExplorePostsCursorPayload = Record<string, unknown> & { fp?: string };

export function encodeExplorePostsCursor(payload: ExplorePostsCursorPayload, fp: string): string {
  return Buffer.from(JSON.stringify({ ...payload, fp })).toString("base64url");
}

export function decodeExplorePostsCursor(encoded: string): ExplorePostsCursorPayload | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString()) as ExplorePostsCursorPayload;
  } catch {
    return null;
  }
}
