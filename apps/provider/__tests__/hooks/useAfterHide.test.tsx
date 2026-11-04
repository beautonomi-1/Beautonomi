import { renderHook, act } from "@testing-library/react-native";
import { useAfterHide } from "@/hooks/useAfterHide";

describe("useAfterHide", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires once when visible becomes false", () => {
    const fn = jest.fn();
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useAfterHide(visible, fn, 280),
      { initialProps: { visible: true } },
    );
    rerender({ visible: false });
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fire again when callback identity changes while hidden", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    const { rerender } = renderHook(
      ({ visible, cb }: { visible: boolean; cb: () => void }) => useAfterHide(visible, cb, 280),
      { initialProps: { visible: true, cb: fn1 } },
    );
    rerender({ visible: false, cb: fn1 });
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(fn1).toHaveBeenCalledTimes(1);
    rerender({ visible: false, cb: fn2 });
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();
  });
});
