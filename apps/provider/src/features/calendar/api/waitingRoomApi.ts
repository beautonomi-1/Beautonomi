export function waitingRoomCountPath(locationId?: string | null): string {
  if (locationId && locationId !== "all") {
    return `/api/provider/waiting-room/count?location_id=${encodeURIComponent(locationId)}`;
  }
  return "/api/provider/waiting-room/count";
}

export const WAITING_ROOM_LIST_PATH = "/api/provider/waiting-room";
