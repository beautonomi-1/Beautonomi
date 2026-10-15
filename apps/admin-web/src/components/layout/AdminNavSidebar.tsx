import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { NavGroupConfig, NavItemConfig } from "@/config/nav";
import { navItemBadgeCount, navItemContainsHref } from "@/config/nav";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";

type NavRowProps = {
  item: NavItemConfig;
  navCounts: Record<string, number>;
  sidebarCollapsed: boolean;
  activeHref: string | null;
  flashHref: string | null;
  depth?: number;
  onNavigate?: () => void;
};

function NavRow({ item, navCounts, sidebarCollapsed, activeHref, flashHref, depth = 0, onNavigate }: NavRowProps) {
  const hasChildren = (item.children?.length ?? 0) > 0;
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isActive = item.href === activeHref;
  const activeBranch = navItemContainsHref(item, activeHref);
  const expanded = manualOpen ?? (hasChildren && activeBranch);
  const count = navItemBadgeCount(item, navCounts);
  const isChildRow = depth > 0;
  /** Collapsed rail hides children, so the hub stands in for its active descendant. */
  const representsActive = isActive || (sidebarCollapsed && !isChildRow && activeBranch);
  const flashing =
    flashHref != null &&
    (flashHref === item.href || (sidebarCollapsed && !isChildRow && navItemContainsHref(item, flashHref)));
  const childListId = `admin-nav-children-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;

  useEffect(() => {
    if (activeBranch) setManualOpen(null);
  }, [activeHref, activeBranch]);

  const toggleExpand = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setManualOpen((prev) => !(prev ?? expanded));
  };

  return (
    <li>
      {item.subheader && !sidebarCollapsed ? (
        <div className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400/80">
          {item.subheader}
        </div>
      ) : item.subheader && sidebarCollapsed ? (
        <div className="my-1.5 mx-1 border-t border-gray-100" />
      ) : null}
      <div className={cn("flex items-stretch", isChildRow && !sidebarCollapsed && "pl-3")}>
        {hasChildren && !sidebarCollapsed ? (
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={expanded ? `Collapse ${item.title}` : `Expand ${item.title}`}
            aria-expanded={expanded}
            aria-controls={expanded ? childListId : undefined}
            onClick={toggleExpand}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <Link
          to={adminSpaTo(item.href)}
          aria-current={isActive ? "page" : undefined}
          data-nav-active={representsActive ? "true" : undefined}
          aria-label={sidebarCollapsed ? item.title : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center rounded-xl border border-transparent text-gray-700 transition-[color,background-color,border-color,box-shadow] duration-300 hover:bg-primary/5 hover:text-gray-900 touch-manipulation",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            representsActive && "border-primary/15 bg-primary/10 font-medium text-primary shadow-sm hover:bg-primary/10 hover:text-primary",
            !representsActive && activeBranch && "font-medium text-primary",
            flashing && "ring-2 ring-primary/60 ring-offset-1",
            sidebarCollapsed ? "relative justify-center px-2 py-2.5" : "justify-between px-3 py-2.5",
            hasChildren && !sidebarCollapsed && !isChildRow && "pl-2",
          )}
          onClick={onNavigate}
          title={sidebarCollapsed ? item.title : undefined}
        >
          <span className={cn("flex min-w-0 items-center", sidebarCollapsed ? "" : "gap-2")}>
            <item.icon
              className={cn("h-4 w-4 shrink-0", activeBranch ? "text-primary" : "text-gray-500 opacity-80")}
            />
            {!sidebarCollapsed && <span className="truncate">{item.title}</span>}
          </span>
          {!sidebarCollapsed && count > 0 ? (
            <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{count}</span>
          ) : null}
          {sidebarCollapsed && count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-white">
              {count > 99 ? "•" : count}
            </span>
          ) : null}
        </Link>
      </div>
      {hasChildren && expanded && !sidebarCollapsed ? (
        <ul id={childListId} className="mt-0.5 space-y-0.5 border-l border-gray-100 ml-4 pl-1">
          {item.children!.map((child) => (
            <NavRow
              key={child.href}
              item={child}
              navCounts={navCounts}
              sidebarCollapsed={sidebarCollapsed}
              activeHref={activeHref}
              flashHref={flashHref}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export type AdminNavSidebarProps = {
  groups: NavGroupConfig[];
  navCounts: Record<string, number>;
  sidebarCollapsed: boolean;
  /** Most specific nav href for the current route (see `resolveActiveNavHref`). */
  activeHref: string | null;
  /** Nav href to briefly ring after a search / Copilot / deep-link navigation. */
  flashHref?: string | null;
  onNavigate?: () => void;
};

export function AdminNavSidebar({
  groups,
  navCounts,
  sidebarCollapsed,
  activeHref,
  flashHref = null,
  onNavigate,
}: AdminNavSidebarProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          {!sidebarCollapsed ? (
            <div
              data-nav-sticky-header
              className="sticky top-0 z-10 mb-1 bg-white px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-400"
            >
              {group.label}
            </div>
          ) : null}
          <ul className="space-y-0.5" aria-label={group.label}>
            {group.items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                navCounts={navCounts}
                sidebarCollapsed={sidebarCollapsed}
                activeHref={activeHref}
                flashHref={flashHref}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export type { LucideIcon };
