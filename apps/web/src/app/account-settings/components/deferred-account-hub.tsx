"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";
import AccountHubSkeleton from "./account-hub-skeleton";

const AccountHubGrid = dynamic(() => import("./account-hub-grid"), {
  loading: () => <AccountHubSkeleton />,
  ssr: false,
});

type DeferredAccountHubProps = {
  embeddedInProfile?: boolean;
};

/**
 * Defers downloading and executing the hub (many lucide icons + cards) until the
 * section is near the viewport, keeping the profile header path lean.
 */
export default function DeferredAccountHub({ embeddedInProfile }: DeferredAccountHubProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(() => Boolean(embeddedInProfile));

  useEffect(() => {
    // On the main Account hub (`embeddedInProfile`), loading the grid only
    // after IntersectionObserver meant users could tap "Bookings" while the
    // chunk was still cold — navigation felt sluggish vs provider profile.
    // Eager-load the hub on that path; keep lazy + IO for any other embeds.
    if (embeddedInProfile) {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    // Deep link /account-settings#account-management — load hub ASAP (defer setState to avoid cascading-render lint).
    if (
      typeof window !== "undefined" &&
      window.location.hash.replace(/^#/, "") === "account-management"
    ) {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "420px 0px", threshold: 0 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [embeddedInProfile]);

  return (
    <div
      ref={containerRef}
      id={embeddedInProfile ? "account-management" : undefined}
      className="min-h-[28rem] scroll-mt-24"
      aria-busy={!shouldLoad}
    >
      {shouldLoad ? (
        <AccountHubGrid embeddedInProfile={embeddedInProfile} />
      ) : (
        <AccountHubSkeleton />
      )}
    </div>
  );
}
