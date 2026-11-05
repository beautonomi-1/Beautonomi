"use client";

import Image from "next/image";

export function ExploreVideoSideLogo({
  spinning,
  floating = false,
}: {
  spinning: boolean;
  floating?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 ${floating ? "absolute bottom-24 right-3" : ""}`}
      style={spinning ? { animation: "explore-reel-spin 9s linear infinite" } : undefined}
    >
      <Image src="/images/logo.svg" alt="" width={22} height={22} />
      <style>{`@keyframes explore-reel-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
