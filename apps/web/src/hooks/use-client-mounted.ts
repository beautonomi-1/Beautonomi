"use client";

import { useEffect, useState } from "react";

/**
 * True after mount. Guards UI that depends on the user's local timezone or locale
 * (e.g. date-fns `isToday` / `format`) so the first client paint matches SSR and
 * avoids hydration error #418.
 */
export function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
