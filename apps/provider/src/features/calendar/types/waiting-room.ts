/** Waiting room list row — shape depends on API; keep loose for forward compatibility. */
export type WaitingRoomListEntry = Record<string, unknown> & { id?: string };
