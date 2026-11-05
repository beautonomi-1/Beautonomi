import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** True when viewport is at least 1024px (lg breakpoint). */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    // Safari < 14 uses addListener/removeListener; modern browsers use addEventListener.
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
    else (mq as unknown as { addListener: (fn: () => void) => void }).addListener(onChange);
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange);
      else (mq as unknown as { removeListener: (fn: () => void) => void }).removeListener(onChange);
    };
  }, []);

  return isDesktop;
}
