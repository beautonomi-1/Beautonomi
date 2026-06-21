"use client";

import React, { useMemo } from "react";
import { MockupSlot } from "@/components/mockups/MockupSlot";

// Match the full empty marker div, then read attributes from the tag so that
// attribute order (data-learn-mockup before/after data-caption) does not matter.
const MOCKUP_MARKER_RE = /<div\b([^>]*\bdata-learn-mockup=[^>]*)>\s*<\/div>/gi;
const MOCKUP_ID_RE = /\bdata-learn-mockup=["']([^"']+)["']/i;
const MOCKUP_CAPTION_RE = /\bdata-caption=["']([^"']*)["']/i;

type Segment =
  | { kind: "html"; html: string }
  | { kind: "mockup"; id: string; caption?: string };

function parseArticleHtml(html: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(MOCKUP_MARKER_RE.source, "gi");
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const id = attrs.match(MOCKUP_ID_RE)?.[1]?.trim();

    // Only treat as a mockup segment when the id is present; otherwise keep raw.
    if (id) {
      const before = html.slice(lastIndex, match.index);
      if (before) segments.push({ kind: "html", html: before });

      const caption = attrs.match(MOCKUP_CAPTION_RE)?.[1]?.trim();
      segments.push({ kind: "mockup", id, caption: caption || undefined });

      lastIndex = match.index + match[0].length;
    }
  }

  const tail = html.slice(lastIndex);
  if (tail) segments.push({ kind: "html", html: tail });

  if (segments.length === 0) segments.push({ kind: "html", html });
  return segments;
}

const PROSE_CLASSNAME = [
  "learn-article-body prose prose-zinc prose-sm max-w-none",
  "prose-headings:text-black prose-p:text-zinc-700 prose-a:text-primary",
  "prose-p:my-3 first:prose-p:mt-0",
  "[&_img]:block [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:my-5 [&_img]:rounded-lg [&_img]:object-contain [&_img]:bg-zinc-100",
  "[&_video]:block [&_video]:w-full [&_video]:max-w-full [&_video]:my-5 [&_video]:rounded-lg [&_video]:bg-zinc-100",
  "[&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:my-5 [&_iframe]:rounded-lg [&_iframe]:min-h-[200px]",
  "[&_.learn-embed-video]:relative [&_.learn-embed-video]:aspect-video [&_.learn-embed-video]:w-full [&_.learn-embed-video]:block [&_.learn-embed-video]:my-5 [&_.learn-embed-video]:rounded-lg [&_.learn-embed-video]:overflow-hidden [&_.learn-embed-video_iframe]:absolute [&_.learn-embed-video_iframe]:inset-0 [&_.learn-embed-video_iframe]:m-0 [&_.learn-embed-video_iframe]:w-full [&_.learn-embed-video_iframe]:h-full [&_.learn-embed-video_iframe]:rounded-lg",
  "[&_picture]:block [&_picture]:my-5 [&_picture]:rounded-lg [&_picture]:overflow-hidden",
  "[&_picture_img]:my-0 [&_picture_img]:w-full [&_picture_img]:max-w-full [&_picture_img]:h-auto",
  "[&_figure:not(.learn-mockup-slot)]:block [&_figure:not(.learn-mockup-slot)]:my-5 [&_figure:not(.learn-mockup-slot)]:max-w-full [&_figure:not(.learn-mockup-slot)]:rounded-lg [&_figure:not(.learn-mockup-slot)]:overflow-hidden",
  "[&_figure:not(.learn-mockup-slot)_img]:my-0 [&_figure:not(.learn-mockup-slot)_img]:w-full [&_figure:not(.learn-mockup-slot)_img]:max-w-full [&_figure:not(.learn-mockup-slot)_img]:h-auto [&_figure:not(.learn-mockup-slot)_img]:rounded-t-lg",
  "[&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:text-zinc-500 [&_figcaption]:text-center [&_figcaption]:italic",
  "[&_table]:block [&_table]:w-full [&_table]:text-sm [&_table]:max-w-full",
  "[&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:sm:text-sm [&_pre]:max-w-full",
].join(" ");

export function LearnArticleBody({ html }: { html: string }) {
  const segments = useMemo(() => parseArticleHtml(html), [html]);

  const hasMockups = segments.some((s) => s.kind === "mockup");
  if (!hasMockups) {
    return <div className={PROSE_CLASSNAME} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div className={PROSE_CLASSNAME}>
      {segments.map((segment, i) =>
        segment.kind === "html" ? (
          <div key={`html-${i}`} dangerouslySetInnerHTML={{ __html: segment.html }} />
        ) : (
          <MockupSlot key={`mockup-${segment.id}-${i}`} id={segment.id} caption={segment.caption} />
        ),
      )}
    </div>
  );
}
