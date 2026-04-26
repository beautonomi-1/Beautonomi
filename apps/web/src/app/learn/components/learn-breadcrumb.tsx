"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 120;

interface LearnBreadcrumbProps {
  /** Ancestor titles (e.g. from article parents or topic parents). */
  parents?: string[];
  /** Slug for each parent (same order). If not provided, parents are text-only. */
  parentSlugs?: string[];
  /** Current page title (e.g. article title or topic title). */
  current: string;
  /** If true, current is a link (e.g. to topic). */
  currentHref?: string;
  className?: string;
}

export function LearnBreadcrumb({
  parents = [],
  parentSlugs = [],
  current,
  currentHref,
  className,
}: LearnBreadcrumbProps) {
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();
  const visible = useTransform(scrollY, (v) => v > SCROLL_THRESHOLD);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Sticky bar uses Framer scroll + DOM; gate to client only so SSR and first paint match.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration enable
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const unsub = visible.on("change", (v) => setShow(Boolean(v)));
    return () => unsub();
  }, [mounted, visible]);

  const content = (
    <>
      <Link href="/" className="text-zinc-500 hover:text-black transition-colors duration-200">
        Beautonomi
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      <Link href="/learn" className="text-zinc-500 hover:text-black transition-colors duration-200">
        Learning Center
      </Link>
      {parents.map((title, i) => {
        const slug = parentSlugs[i];
        return (
          <React.Fragment key={i}>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            {slug ? (
              <Link
                href={`/learn/${slug}`}
                className="text-zinc-500 hover:text-black transition-colors duration-200"
              >
                {title}
              </Link>
            ) : (
              <span className="text-zinc-500">{title}</span>
            )}
          </React.Fragment>
        );
      })}
      <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      {currentHref ? (
        <Link
          href={currentHref}
          className="font-medium text-black"
        >
          {current}
        </Link>
      ) : (
        <span className="font-medium text-black">{current}</span>
      )}
    </>
  );

  return (
    <>
      {/* Inline breadcrumb (always in flow) */}
      <nav
        className={cn("text-xs text-zinc-500 flex items-center gap-1 flex-wrap", className)}
        aria-label="Breadcrumb"
      >
        {content}
      </nav>
      {/* Sticky glass bar (visible on scroll) */}
      {mounted && (
        <motion.nav
          initial={false}
          animate={{ opacity: show ? 1 : 0, y: show ? 0 : -8 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "sticky top-[57px] z-30 -mx-4 px-4 py-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8",
            "backdrop-blur-xl bg-zinc-50/90 border-b border-zinc-200/50",
            "flex items-center gap-1 text-xs flex-wrap",
            !show && "pointer-events-none"
          )}
          aria-label="Breadcrumb"
        >
          {content}
        </motion.nav>
      )}
    </>
  );
}
