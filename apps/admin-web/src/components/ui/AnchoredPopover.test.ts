import { describe, expect, it } from "vitest";
import { computeAnchoredPopoverPlacement } from "@/components/ui/AnchoredPopover";

const viewport = { width: 1024, height: 530 };

describe("computeAnchoredPopoverPlacement", () => {
  it("opens above a composer button and limits height to the room above it", () => {
    const p = computeAnchoredPopoverPlacement({
      anchor: { top: 436, bottom: 466, left: 256, right: 336 },
      viewport,
      width: 360,
      maxHeight: 440,
    });
    expect(p.side).toBe("top");
    expect(p.bottom).toBe(530 - 436 + 6);
    expect(p.maxHeight).toBe(436 - 6 - 8);
    expect(p.left).toBe(256);
  });

  it("flips below when the anchor is near the top of the window", () => {
    const p = computeAnchoredPopoverPlacement({
      anchor: { top: 40, bottom: 70, left: 100, right: 180 },
      viewport,
      width: 360,
      maxHeight: 440,
    });
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(76);
    expect(p.maxHeight).toBe(440);
  });

  it("keeps the popover inside the window horizontally", () => {
    const p = computeAnchoredPopoverPlacement({
      anchor: { top: 436, bottom: 466, left: 900, right: 980 },
      viewport,
      width: 360,
      maxHeight: 440,
    });
    expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - 8);
    const narrow = computeAnchoredPopoverPlacement({
      anchor: { top: 600, bottom: 630, left: 10, right: 90 },
      viewport: { width: 320, height: 700 },
      width: 360,
      maxHeight: 440,
    });
    expect(narrow.width).toBe(304);
    expect(narrow.left).toBe(8);
  });
});
