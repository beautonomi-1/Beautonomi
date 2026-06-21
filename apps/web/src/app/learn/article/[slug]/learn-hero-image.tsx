"use client";

import React, { useState } from "react";

function useHideOnMediaError() {
  const [errored, setErrored] = useState(false);
  return { errored, onError: () => setErrored(true) };
}

export function LearnHeroImage({ src }: { src: string }) {
  const { errored, onError } = useHideOnMediaError();
  if (errored) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100 aspect-[16/10] max-h-[min(55vh,320px)] border border-zinc-200/80 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover object-top" onError={onError} />
    </div>
  );
}

export function LearnHeroGif({ src }: { src: string }) {
  const { errored, onError } = useHideOnMediaError();
  if (errored) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100 border border-zinc-200/80 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="w-full h-auto max-h-[min(70vh,420px)] object-contain mx-auto"
        onError={onError}
      />
    </div>
  );
}

export function LearnHeroVideo({ src }: { src: string }) {
  const { errored, onError } = useHideOnMediaError();
  if (errored) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black border border-zinc-200/80 shadow-sm">
      <video
        className="w-full max-h-[min(70vh,420px)] object-contain"
        controls
        playsInline
        preload="metadata"
        onError={onError}
      >
        <source src={src} />
        Your browser does not support embedded video.
      </video>
    </div>
  );
}
