import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { NavLink, type NavLinkRenderProps } from "react-router";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { NavGroupConfig, NavItemConfig } from "@/config/nav";
import { navItemBadgeCount } from "@/config/nav";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";

function pathMatchesNavHref(pathname: string, href: string): boolean {
  const spa = adminSpaTo(href);
  return pathname === spa || pathname.startsWith(`${spa}/`);
}

function childIsActive(pathname: string, item: NavItemConfig): boolean {
  if (pathMatchesNavHref(pathname, item.href)) return true;
  return (item.children ?? []).some((c) => childIsActive(pathname, c));
}

type NavRowProps = {
  item: NavItemConfig;
  navCounts: Record<string, number>;
  sidebarCollapsed: boolean;
  pathname: string;
  depth?: number;
  onNavigate?: () => void;
};

function NavRow({ item, navCounts, sidebarCollapsed, pathname, depth = 0, onNavigate }: NavRowProps) {
  const hasChildren = (item.children?.length ?? 0) > 0;
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const activeBranch = childIsActive(pathname, item);
  const expanded = manualOpen ?? (hasChildren && activeBranch);
  const count = navItemBadgeCount(item, navCounts);
  const isChildRow = depth > 0;

  useEffect(() => {
    if (activeBranch && manualOpen === false) {
      setManualOpen(null);
    }
  }, [activeBranch, manualOpen]);

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
            className="inline-flex w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={expanded ? "Collapse section" : "Expand section"}
            aria-expanded={expanded}
            onClick={toggleExpand}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        <NavLink
          to={adminSpaTo(item.href)}
          className={({ isActive }: NavLinkRenderProps) =>
            cn(
              "flex min-h-11 flex-1 items-center rounded-xl border border-transparent text-gray-700 transition-colors hover:bg-primary/5 hover:text-gray-900 touch-manipulation",
              (isActive || (hasChildren && activeBranch && !isChildRow)) &&
                "border-primary/15 bg-primary/10 font-medium text-primary shadow-sm",
              sidebarCollapsed ? "relative justify-center px-2 py-2.5" : "justify-between px-3 py-2.5",
              hasChildren && !sidebarCollapsed && !isChildRow && "pl-2",
            )
          }
          onClick={onNavigate}
          title={sidebarCollapsed ? item.title : undefined}
        >
          {({ isActive }: NavLinkRenderProps) => (
            <>
              <span className={cn("flex items-center", sidebarCollapsed ? "" : "gap-2")}>
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive || activeBranch ? "text-primary" : "text-gray-500 opacity-80",
                  )}
                />
                {!sidebarCollapsed && <span>{item.title}</span>}
              </span>
              {!sidebarCollapsed && count > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{count}</span>
              ) : null}
              {sidebarCollapsed && count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-white">
                  {count > 99 ? "•" : count}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      </div>
      {hasChildren && expanded && !sidebarCollapsed ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-gray-100 ml-4 pl-1">
          {item.children!.map((child) => (
            <NavRow
              key={child.href}
              item={child}
              navCounts={navCounts}
              sidebarCollapsed={sidebarCollapsed}
              pathname={pathname}
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
  pathname: string;
  onNavigate?: () => void;
};

export function AdminNavSidebar({
  groups,
  navCounts,
  sidebarCollapsed,
  pathname,
  onNavigate,
}: AdminNavSidebarProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          {!sidebarCollapsed ? (
            <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">{group.label}</div>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                navCounts={navCounts}
                sidebarCollapsed={sidebarCollapsed}
                pathname={pathname}
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
