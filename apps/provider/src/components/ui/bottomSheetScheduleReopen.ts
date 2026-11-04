/** After close animation, reopen if the parent still wants the sheet visible (vetoed dismiss). */
export function scheduleBottomSheetReopenIfStillVisible(
  getStillVisible: () => boolean,
  reopen: () => void,
  scheduleFrame: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
): void {
  scheduleFrame(() => {
    scheduleFrame(() => {
      if (getStillVisible()) reopen();
    });
  });
}
