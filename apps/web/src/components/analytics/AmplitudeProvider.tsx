"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AmplitudeProvider as AmplitudeContextProvider } from "@/providers/AmplitudeProvider";
import AmplitudeGuidesProvider from "./AmplitudeGuidesProvider";
import AmplitudeSurveysProvider from "./AmplitudeSurveysProvider";

/**
 * Client component wrapper for AmplitudeProvider
 * Detects portal from route and initializes Amplitude accordingly
 */
export default function AmplitudeProviderWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Detect portal from route
  let portal: "client" | "provider" | "admin" = "client";
  if (pathname?.startsWith("/provider")) {
    portal = "provider";
  } else if (pathname?.startsWith("/admin")) {
    portal = "admin";
  }

  return (
    <AmplitudeContextProvider portal={portal}>
      <AmplitudeGuidesProvider>
        <AmplitudeSurveysProvider>
          {children}
        </AmplitudeSurveysProvider>
      </AmplitudeGuidesProvider>
    </AmplitudeContextProvider>
  );
}
