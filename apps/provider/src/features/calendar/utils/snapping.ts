/**
 * Snap a minute value to the nearest increment.
 * @param minutes - absolute minute-of-day value
 * @param incrementMinutes - e.g. 15 for quarter-hour increments
 */
export function snapToIncrement(minutes: number, incrementMinutes: number): number {
  if (!Number.isFinite(incrementMinutes) || incrementMinutes <= 0) return minutes;
  return Math.round(minutes / incrementMinutes) * incrementMinutes;
}

/**
 * Clamp a minute-of-day value to [startHour*60, endHour*60].
 */
export function clampToGrid(minutes: number, startHour: number, endHour: number): number {
  return Math.min(Math.max(minutes, startHour * 60), endHour * 60);
}

/**
 * Snap Y offset to nearest time increment on the grid.
 */
export function snapYToIncrement(args: {
  y: number;
  gridTopPadding: number;
  rowHeight: number;
}): number {
  const { y, gridTopPadding, rowHeight } = args;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return y;
  const rel = y - gridTopPadding;
  const snappedRows = Math.round(rel / rowHeight);
  return gridTopPadding + snappedRows * rowHeight;
}

export function clampY(args: { y: number; minY: number; maxY: number }): number {
  const { y, minY, maxY } = args;
  return Math.min(Math.max(y, minY), maxY);
}
