"use client";

import dynamic from "next/dynamic";

// Client-only load to avoid Turbopack HMR "module factory is not available" for React.
// dynamic(..., { ssr: false }) must run in a Client Component, not the root Server layout.
const SuppressConsoleWarnings = dynamic(
  () => import("@/components/global/suppress-console-warnings"),
  { ssr: false }
);

export default function SuppressConsoleWarningsWrapper() {
  return <SuppressConsoleWarnings />;
}
