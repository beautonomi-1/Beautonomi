"use client";

import React from "react";
import { getMockupCatalogEntry } from "@beautonomi/learning-mockups";
import { MOCKUP_REGISTRY } from "./registry";

type MockupSlotProps = {
  id: string;
  caption?: string;
};

export function MockupSlot({ id, caption }: MockupSlotProps) {
  const render = MOCKUP_REGISTRY[id];
  if (!render) return null;

  const entry = getMockupCatalogEntry(id);

  return (
    <figure className="learn-mockup-slot my-8 not-prose" aria-label={entry?.label ?? "App mockup"}>
      <div className="flex justify-center px-2 sm:px-4">{render()}</div>
      {caption ? (
        <figcaption className="mt-3 text-center text-sm italic text-zinc-500">{caption}</figcaption>
      ) : entry?.label ? (
        <figcaption className="mt-3 text-center text-sm italic text-zinc-500">{entry.label}</figcaption>
      ) : null}
    </figure>
  );
}
