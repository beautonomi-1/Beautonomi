"use client";

import { ReactNode } from "react";

/** No-op shim; engagement loads in AmplitudeEngagementProvider. Keeps path stable for Tailwind/Turbopack incremental caches. */
export default function AmplitudeGuidesProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
