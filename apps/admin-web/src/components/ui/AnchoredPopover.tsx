import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

export type AnchoredPopoverPlacement = {
  side: "top" | "bottom";
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

/**
 * Places a popover next to its anchor inside the viewport. Prefers `preferred`, flips when the
 * other side has more room, and clamps width and left so it never leaves the window.
 */
export function computeAnchoredPopoverPlacement(input: {
  anchor: { top: number; bottom: number; left: number; right: number };
  viewport: { width: number; height: number };
  width: number;
  maxHeight: number;
  align?: "start" | "end";
  preferred?: "top" | "bottom";
  minComfortableHeight?: number;
}): AnchoredPopoverPlacement {
  const { anchor, viewport, align = "start", preferred = "top", minComfortableHeight = 240 } = input;
  const width = Math.max(0, Math.min(input.width, viewport.width - VIEWPORT_MARGIN * 2));
  const spaceAbove = Math.max(0, anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN);
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN);
  const preferredSpace = preferred === "top" ? spaceAbove : spaceBelow;
  const otherSpace = preferred === "top" ? spaceBelow : spaceAbove;
  const side =
    preferredSpace >= Math.min(input.maxHeight, minComfortableHeight) || preferredSpace >= otherSpace
      ? preferred
      : preferred === "top"
        ? "bottom"
        : "top";
  const available = side === "top" ? spaceAbove : spaceBelow;
  const rawLeft = align === "end" ? anchor.right - width : anchor.left;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, rawLeft),
    Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN),
  );
  const maxHeight = Math.min(input.maxHeight, available);
  return side === "top"
    ? { side, left, width, maxHeight, bottom: viewport.height - anchor.top + ANCHOR_GAP }
    : { side, left, width, maxHeight, top: anchor.bottom + ANCHOR_GAP };
}

type AnchoredPopoverProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  maxHeight?: number;
  align?: "start" | "end";
  preferred?: "top" | "bottom";
  className?: string;
  role?: string;
  ariaLabel?: string;
};

/** Popover rendered on document.body so scrolling or clipped parents never cut it off. */
export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  children,
  width = 320,
  maxHeight = 420,
  align = "start",
  preferred = "top",
  className,
  role,
  ariaLabel,
}: AnchoredPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const placement = computeAnchoredPopoverPlacement({
        anchor: rect,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        width,
        maxHeight,
        align,
        preferred,
      });
      setStyle({
        position: "fixed",
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        top: placement.top,
        bottom: placement.bottom,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, width, maxHeight, align, preferred]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorRef]);

  if (!open || !style || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      role={role}
      aria-label={ariaLabel}
      style={style}
      className={cn(
        "admin-scrollbar z-[60] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
