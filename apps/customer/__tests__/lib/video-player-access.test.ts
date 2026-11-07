import { isReleasedVideoPlayerError, runVideoPlayer, withVideoPlayer } from "@/lib/video-player-access";

function releasedError(): Error {
  const error = new Error(
    "FunctionCallException: Calling the 'get' function has failed → Caused by: NotFoundException: Unable to find the native shared object associated with given JavaScript object",
  );
  (error as Error & { code: string }).code = "ERR_NATIVE_SHARED_OBJECT_NOT_FOUND";
  return error;
}

describe("video player access", () => {
  it("recognizes a released expo-video shared object", () => {
    expect(isReleasedVideoPlayerError(releasedError())).toBe(true);
    expect(isReleasedVideoPlayerError(new Error("network"))).toBe(false);
  });

  it("returns the fallback when the native player is already gone", () => {
    expect(
      withVideoPlayer(() => {
        throw releasedError();
      }, 0),
    ).toBe(0);
  });

  it("swallows commands against a released player and rethrows anything else", () => {
    expect(() => runVideoPlayer(() => { throw releasedError(); })).not.toThrow();
    expect(() => runVideoPlayer(() => { throw new Error("network"); })).toThrow("network");
  });
});
