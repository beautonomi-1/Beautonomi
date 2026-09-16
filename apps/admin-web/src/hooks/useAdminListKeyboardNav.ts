import { useCallback, useEffect, type RefObject } from "react";

type ListItem = { id: string };

/**
 * ArrowUp/ArrowDown row focus; optional Enter to open a row.
 * Attach `containerRef` to scope keys to a panel (defaults to window).
 */
export function useAdminListKeyboardNav<T extends ListItem>({
  items,
  selectedId,
  onSelect,
  onOpen,
  enabled = true,
  containerRef,
}: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
  enabled?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || items.length === 0) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT")
      ) {
        return;
      }

      const currentId = selectedId ?? items[0]?.id;
      const idx = items.findIndex((t) => t.id === currentId);
      if (idx < 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[Math.min(idx + 1, items.length - 1)];
        if (next) onSelect(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[Math.max(idx - 1, 0)];
        if (prev) onSelect(prev.id);
      } else if (e.key === "Enter" && currentId && onOpen) {
        e.preventDefault();
        onOpen(currentId);
      }
    },
    [enabled, items, selectedId, onSelect, onOpen],
  );

  useEffect(() => {
    const node = containerRef?.current;
    const target: EventTarget = node ?? window;
    target.addEventListener("keydown", handleKeyDown as EventListener);
    return () => target.removeEventListener("keydown", handleKeyDown as EventListener);
  }, [handleKeyDown, containerRef]);
}
