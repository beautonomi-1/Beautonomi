import { scheduleBottomSheetReopenIfStillVisible } from "@/components/ui/bottomSheetScheduleReopen";

describe("scheduleBottomSheetReopenIfStillVisible", () => {
  it("reopens only when parent still visible after two frames", () => {
    let visible = true;
    const reopen = jest.fn();
    const frames: Array<() => void> = [];
    const scheduleFrame = (cb: () => void) => {
      frames.push(cb);
      return frames.length;
    };

    scheduleBottomSheetReopenIfStillVisible(() => visible, reopen, scheduleFrame);
    expect(reopen).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    frames[0]!();
    expect(reopen).not.toHaveBeenCalled();
    expect(frames).toHaveLength(2);

    visible = false;
    frames[1]!();
    expect(reopen).not.toHaveBeenCalled();

    visible = true;
    scheduleBottomSheetReopenIfStillVisible(() => visible, reopen, scheduleFrame);
    frames[2]!();
    frames[3]!();
    expect(reopen).toHaveBeenCalledTimes(1);
  });
});
