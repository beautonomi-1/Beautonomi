"use client";

import dynamic from "next/dynamic";

/**
 * ProviderCard loaded in a separate chunk to avoid pulling i18n (and other
 * heavy deps) into the same HMR boundary as home sections. Prevents
 * "module factory is not available" errors after HMR updates.
 */
export default dynamic(
  () => import("./provider-card").then((m) => m.default),
  { ssr: true }
);
