"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, ChevronRight, BookOpen, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchWithSuggestions } from "./components/search-with-suggestions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { LearnProvider, useLearnContext } from "./learn-context";
import "./learn.css";

interface Category {
  id: string;
  title: string;
  slug: string;
  audience: string;
}

interface TreeNode extends Category {
  children: TreeNode[];
}

const AUDIENCE_LABELS: Record<string, string> = {
  general: "General",
  customer: "For Customers",
  provider: "For Providers",
};

const AUDIENCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  general: BookOpen,
  customer: Users,
  provider: Briefcase,
};

function groupByAudience(categories: Category[]) {
  const groups: Record<string, Category[]> = {};
  for (const c of categories) {
    const key = AUDIENCE_LABELS[c.audience] ? c.audience : "general";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return ["general", "customer", "provider"].filter((k) => groups[k]?.length);
}

/** Recursive sidebar node: link + optional chevron-expanded children. */
function SidebarNode({
  node,
  pathname,
  onNavigate,
  depth = 0,
}: {
  node: TreeNode;
  pathname: string;
  onNavigate?: () => void;
  depth?: number;
}) {
  const isActive = pathname === `/learn/${node.slug}`;
  const hasChildren = node.children?.length > 0;
  const pl = 12 + depth * 12;

  return (
    <li className="list-none">
      <Link
        href={`/learn/${node.slug}`}
        onClick={onNavigate}
        className={cn(
          "flex min-h-[44px] items-center gap-2 rounded-xl pl-3 pr-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out border-0 relative",
          isActive ? "bg-transparent text-black font-bold" : "text-zinc-600 hover:bg-zinc-100 hover:text-black"
        )}
        style={{ paddingLeft: pl }}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[#ff0077]" />
        )}
        <span className="flex-1">{node.title}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </Link>
      {hasChildren && (
        <ul className="space-y-0.5 mt-0.5">
          {node.children!.map((child) => (
            <SidebarNode
              key={child.id}
              node={child}
              pathname={pathname}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Sidebar when data is a tree (from /api/public/learn/tree). */
function TopicSidebarTree({
  tree,
  pathname,
  onNavigate,
  className,
}: {
  tree: TreeNode[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const byAudience = useMemo(() => {
    const map: Record<string, TreeNode[]> = { general: [], customer: [], provider: [] };
    tree.forEach((n) => {
      const key = AUDIENCE_LABELS[n.audience] ? n.audience : "general";
      if (map[key]) map[key].push(n);
    });
    return map;
  }, [tree]);
  const order = ["general", "customer", "provider"];

  return (
    <nav className={cn("flex flex-col", className)} aria-label="Topics">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2.5">
        Knowledge clusters
      </p>
      <Accordion type="multiple" defaultValue={[]} className="w-full">
        {order.map((key) => {
          const nodes = byAudience[key] ?? [];
          if (nodes.length === 0) return null;
          const label = AUDIENCE_LABELS[key] ?? key;
          const Icon = AUDIENCE_ICONS[key];
          return (
            <AccordionItem key={key} value={key} className="border-0">
              <AccordionTrigger className="min-h-[44px] py-2 px-3 text-sm font-medium text-black hover:no-underline hover:bg-zinc-100 rounded-xl transition-all duration-200 ease-in-out [&[data-state=open]>svg]:rotate-180">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-500" />}
                <span className="ml-2">{label}</span>
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-0">
                <ul className="space-y-0.5">
                  {nodes.map((n) => (
                    <SidebarNode key={n.id} node={n} pathname={pathname} onNavigate={onNavigate} />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </nav>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col px-3 py-2 animate-pulse" aria-hidden>
      <div className="h-4 w-28 bg-zinc-200 rounded-xl mb-4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-3">
          <div className="h-10 bg-zinc-100 rounded-xl mb-2" />
          <div className="space-y-1.5 pl-2">
            {[1, 2].map((j) => (
              <div key={j} className="h-9 bg-zinc-100/80 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopicSidebar({
  categories,
  pathname,
  onNavigate,
  className,
  linkClassName,
}: {
  categories: Category[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
}) {
  const groups = useMemo(() => groupByAudience(categories), [categories]);
  const audienceOrder = ["general", "customer", "provider"];

  return (
    <nav className={cn("flex flex-col", className)} aria-label="Topics">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2.5">
        Knowledge clusters
      </p>
      <Accordion type="multiple" defaultValue={[]} className="w-full">
        {audienceOrder.map((key) => {
          const list = categories.filter((c) => c.audience === key);
          if (list.length === 0) return null;
          const label = AUDIENCE_LABELS[key] ?? key;
          const Icon = AUDIENCE_ICONS[key];
          return (
            <AccordionItem key={key} value={key} className="border-0">
              <AccordionTrigger className="min-h-[44px] py-2 px-3 text-sm font-medium text-black hover:no-underline hover:bg-zinc-100 rounded-xl transition-all duration-200 ease-in-out [&[data-state=open]>svg]:rotate-180">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-500" />}
                <span className="ml-2">{label}</span>
              </AccordionTrigger>
              <AccordionContent className="pb-1 pt-0">
                <ul className="space-y-0.5">
                  {list.map((c) => {
                    const isActive = pathname === `/learn/${c.slug}`;
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/learn/${c.slug}`}
                          onClick={onNavigate}
                          className={cn(
                            "flex min-h-[44px] items-center gap-2 rounded-xl pl-3 pr-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out border-0 relative",
                            isActive
                              ? "bg-transparent text-black font-bold"
                              : "text-zinc-600 hover:bg-zinc-100 hover:text-black",
                            linkClassName
                          )}
                        >
                          {/* Active: vertical pink pill 2px left */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[#ff0077]" />
                          )}
                          <span className="flex-1">{c.title}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </nav>
  );
}

function LearnLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { searchHeroVisible, setSearchHeroVisible, searchOverlayOpen, setSearchOverlayOpen } = useLearnContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/learn") setSearchHeroVisible(false);
  }, [pathname, setSearchHeroVisible]);

  useEffect(() => {
    setCategoriesLoading(true);
    Promise.all([
      fetch("/api/public/learn/tree").then((r) => r.json()),
      fetch("/api/public/learn/categories").then((r) => r.json()),
    ])
      .then(([treeRes, catRes]) => {
        const treeData = treeRes.data;
        const flatData = catRes.data ?? [];
        if (Array.isArray(treeData) && treeData.length > 0) {
          setTree(treeData as TreeNode[]);
          setCategories([]);
        } else {
          setTree(null);
          setCategories(flatData as Category[]);
        }
      })
      .catch(() => {
        setTree(null);
        setCategories([]);
      })
      .finally(() => setCategoriesLoading(false));
  }, []);

  const isHome = pathname === "/learn";
  const showCompactSearch = !searchHeroVisible || !isHome;

  const sidebarContent = (
    <>
      <div className="p-3 border-b border-zinc-200/50">
        <SearchWithSuggestions
          value={searchQ}
          onChange={setSearchQ}
          placeholder="Search articles..."
          size="sm"
          onSelectSuggestion={() => {
            setDrawerOpen(false);
            setSearchOverlayOpen(false);
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {categoriesLoading ? (
          <SidebarSkeleton />
        ) : tree && tree.length > 0 ? (
          <TopicSidebarTree
            tree={tree}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        ) : (
          <TopicSidebar
            categories={categories}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-50 antialiased">
      {/* Glass header: backdrop-blur-xl, 1px stroke */}
      <header
        className={cn(
          "sticky top-0 z-40 border-b border-zinc-200/50 backdrop-blur-xl bg-white/70 transition-all duration-200 ease-in-out"
        )}
      >
        <div className="flex min-h-[56px] md:min-h-[56px] items-center gap-2 px-4 py-2">
          {/* Mobile: open bottom drawer */}
          <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} direction="bottom">
            <button
              type="button"
              className="md:hidden h-11 w-11 min-w-[44px] min-h-[44px] shrink-0 rounded-full text-zinc-600 hover:bg-zinc-100 transition-all duration-200 ease-in-out active:scale-[0.97] touch-manipulation inline-flex items-center justify-center"
              aria-label="Open topics"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Drawer.Portal>
              <Drawer.Overlay className="bg-black/40 backdrop-blur-sm" />
              <Drawer.Content
                className="flex flex-col rounded-t-[24px] bg-zinc-50 border border-b-0 border-zinc-200/50 max-h-[85vh] mx-auto focus:outline-none"
                aria-describedby={undefined}
              >
                <Dialog.Title className="sr-only">Topics</Dialog.Title>
                <Dialog.Description className="sr-only">Browse learning center topics and articles.</Dialog.Description>
                <div className="w-12 h-1 rounded-full bg-zinc-200 mx-auto mt-3 flex-shrink-0" />
                <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                  {sidebarContent}
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>

          <Link
            href="/learn"
            className="font-bold text-black text-base md:text-lg shrink-0 hover:text-[#ff0077] transition-colors duration-200 tracking-tight"
          >
            Learning Center
          </Link>
          <div className="hidden md:flex flex-1 max-w-sm lg:max-w-md ml-4">
            <SearchWithSuggestions
              value={searchQ}
              onChange={setSearchQ}
              placeholder="Search"
              size="sm"
            />
          </div>
          {showCompactSearch && (
            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              className="md:hidden flex-1 flex min-w-0 ml-2 min-h-[44px] items-center gap-2 rounded-full border border-zinc-200/50 bg-white/70 backdrop-blur-xl px-4 text-left text-sm text-zinc-500 transition-all duration-200 ease-in-out active:scale-[0.97]"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>Search articles...</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar: glass, 1px stroke */}
        <aside className="hidden md:block w-60 lg:w-64 shrink-0 sticky top-[57px] self-start border-r border-zinc-200/50 backdrop-blur-xl bg-white/70 max-h-[calc(100vh-57px)] overflow-y-auto py-4 px-2">
          {categoriesLoading ? (
            <SidebarSkeleton />
          ) : tree && tree.length > 0 ? (
            <TopicSidebarTree tree={tree} pathname={pathname} />
          ) : (
            <TopicSidebar categories={categories} pathname={pathname} />
          )}
        </aside>
        <main className="flex-1 min-w-0 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>

      {/* Mobile full-screen search overlay — glass */}
      {searchOverlayOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            aria-hidden
            onClick={() => setSearchOverlayOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 md:hidden">
            <div className="p-4 border-b border-zinc-200/50">
              <SearchWithSuggestions
                value={searchQ}
                onChange={setSearchQ}
                placeholder="Search articles..."
                size="lg"
                variant="hero"
                onSelectSuggestion={() => setSearchOverlayOpen(false)}
              />
            </div>
            <p className="px-4 py-2 text-xs text-zinc-500">Or browse topics below</p>
            <div className="flex-1 overflow-y-auto px-2 pb-8">
              {categoriesLoading ? (
                <SidebarSkeleton />
              ) : tree && tree.length > 0 ? (
                <TopicSidebarTree
                  tree={tree}
                  pathname={pathname}
                  onNavigate={() => setSearchOverlayOpen(false)}
                />
              ) : (
                <TopicSidebar
                  categories={categories}
                  pathname={pathname}
                  onNavigate={() => setSearchOverlayOpen(false)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <LearnProvider>
      <LearnLayoutInner>{children}</LearnLayoutInner>
    </LearnProvider>
  );
}
