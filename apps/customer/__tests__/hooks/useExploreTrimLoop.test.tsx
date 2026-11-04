import { act, renderHook } from "@testing-library/react-native";
import type { VideoPlayer } from "expo-video";
import { useExploreTrimLoop } from "@/hooks/useExploreTrimLoop";

type Listener = (payload: { status: string }) => void;

function makePlayer(status: string) {
  const listeners = new Set<Listener>();
  const player = {
    status,
    currentTime: 0,
    playing: true,
    play: jest.fn(() => {
      player.playing = true;
    }),
    addListener: jest.fn((_event: string, cb: Listener) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    }),
    emitStatus(next: string) {
      player.status = next;
      for (const cb of [...listeners]) cb({ status: next });
    },
    listenerCount: () => listeners.size,
  };
  return player;
}

describe("useExploreTrimLoop", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits for readyToPlay before the first seek (iOS ignores earlier seeks)", () => {
    const player = makePlayer("loading");
    renderHook(() => useExploreTrimLoop(player as unknown as VideoPlayer, 4000, 9000, true));
    expect(player.currentTime).toBe(0);
    act(() => player.emitStatus("readyToPlay"));
    expect(player.currentTime).toBe(4);
    expect(player.listenerCount()).toBe(0);
  });

  it("seeks immediately when the player is already ready", () => {
    const player = makePlayer("readyToPlay");
    renderHook(() => useExploreTrimLoop(player as unknown as VideoPlayer, 2500, 6000, true));
    expect(player.currentTime).toBe(2.5);
  });

  it("loops back to the trim start at the trim end and resumes playback", () => {
    const player = makePlayer("readyToPlay");
    renderHook(() => useExploreTrimLoop(player as unknown as VideoPlayer, 2000, 5000, true));
    player.currentTime = 4.99;
    player.playing = false;
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(player.currentTime).toBe(2);
    expect(player.play).toHaveBeenCalled();
  });

  it("does not reset on re-render with the same window", () => {
    const player = makePlayer("readyToPlay");
    const { rerender } = renderHook(
      ({ s, e }: { s: number; e: number }) =>
        useExploreTrimLoop(player as unknown as VideoPlayer, s, e, true),
      { initialProps: { s: 2000, e: 5000 } },
    );
    player.currentTime = 3.2;
    rerender({ s: 2000, e: 5000 });
    expect(player.currentTime).toBe(3.2);
  });

  it("does nothing without a trim window", () => {
    const player = makePlayer("readyToPlay");
    player.currentTime = 7;
    renderHook(() => useExploreTrimLoop(player as unknown as VideoPlayer, null, null, true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(player.currentTime).toBe(7);
  });
});
