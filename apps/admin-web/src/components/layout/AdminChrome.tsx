import {
  Suspense,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, LogOut, Search, PanelLeftClose, PanelLeftOpen, CornerDownLeft, type LucideIcon } from "lucide-react";
import { ADMIN_SECTION_SUPPORT, ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { AdminApiError } from "@beautonomi/admin-api-client";
import {
  ADMIN_SCOPE_STORAGE_KEY,
  ADMIN_SCOPE_TENANT_STORAGE_KEY,
} from "@beautonomi/admin-api-client";
import type { UserRole } from "@beautonomi/types";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { filterNavTree, flattenNavItems, NAV_GROUPS } from "@/config/nav";
import { deskForAdminRole, isOpsDeskManager } from "@/lib/providerOpsDeskNav";
import { AdminNavSidebar } from "@/components/layout/AdminNavSidebar";
import { CommandPalette, pushRecentSearch } from "@/components/layout/CommandPalette";
import { cn } from "@/lib/cn";
import { adminSearchResultSpaPath } from "@/lib/adminSearchSpaPaths";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminBreadcrumbs } from "@/components/ui/AdminBreadcrumbs";
import { AdminBreadcrumbProvider } from "@/providers/AdminBreadcrumbProvider";
import { AdminNotificationBell } from "@/components/layout/AdminNotificationBell";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { GlobalFloatingCopilot } from "@/components/agent-assist/GlobalFloatingCopilot";

export function AdminChrome() {
  const qc = useQueryClient();
  const {
    bootstrap,
    signOut,
    canAccess,
    canUseGlobalSearch,
    sectionPermissionsError,
    isSectionPermissionsPending,
    refetchSectionPermissions,
  } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("admin_sidebar_collapsed") === "1";
  });
  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("admin_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    users: Array<{ id: string; email: string; full_name: string | null; phone?: string | null }>;
    bookings: Array<{ id: string; booking_number: string; created_at?: string }>;
    providers: Array<{
      id: string;
      business_name: string;
      owner_name?: string | null;
      owner_email?: string | null;
    }>;
    leads?: Array<{ id: string; business_name: string | null; lead_name: string | null; email: string | null }>;
    onboarding_drafts?: Array<{ user_id: string; business_name: string | null; owner_email: string | null; owner_name: string | null }>;
  } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  /** Highlighted entry in the flattened result list (nav + entities) for keyboard nav. */
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const navCountsQuery = useQuery({
    queryKey: adminQueryKeys.navCounts(),
    queryFn: async () => {
      try {
        return await adminApi.getJson<Record<string, number>>("/api/admin/nav-counts");
      } catch (e) {
        if (e instanceof AdminApiError && (e.status === 403 || e.status === 401)) {
          return {} as Record<string, number>;
        }
        // Degrade quietly: stale counts are better than a flashing error state / retry storms on 5xx.
        if (e instanceof AdminApiError && e.status >= 500) {
          return {} as Record<string, number>;
        }
        throw e;
      }
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const tenantsQuery = useQuery({
    queryKey: adminQueryKeys.tenants(),
    queryFn: () => adminApi.getJson<Array<{ id: string; name?: string; slug?: string | null }>>("/api/admin/tenants"),
    enabled: bootstrap?.isSuperadmin === true,
    staleTime: 5 * 60_000,
  });

  const [scopeMode, setScopeMode] = useState<"tenant" | "global">("tenant");
  const [scopeTenantId, setScopeTenantId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.localStorage.getItem(ADMIN_SCOPE_STORAGE_KEY);
    const t = window.localStorage.getItem(ADMIN_SCOPE_TENANT_STORAGE_KEY);
    if (m === "global" || m === "tenant") setScopeMode(m);
    if (t) setScopeTenantId(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_SCOPE_STORAGE_KEY, scopeMode);
    if (scopeTenantId) window.localStorage.setItem(ADMIN_SCOPE_TENANT_STORAGE_KEY, scopeTenantId);
  }, [scopeMode, scopeTenantId]);

  const scopePickerEpoch = useRef<string | null>(null);
  /** Superadmin tenant/global picker: refetch admin data when scope changes (not on first mount). */
  useEffect(() => {
    if (!bootstrap?.isSuperadmin) return;
    const key = `${scopeMode}|${scopeTenantId}`;
    if (scopePickerEpoch.current === null) {
      scopePickerEpoch.current = key;
      return;
    }
    if (scopePickerEpoch.current === key) return;
    scopePickerEpoch.current = key;
    void qc.invalidateQueries({ queryKey: adminQueryKeys.root });
  }, [scopeMode, scopeTenantId, bootstrap?.isSuperadmin, qc]);

  useEffect(() => {
    const rows = tenantsQuery.data;
    if (!rows?.length || scopeTenantId) return;
    setScopeTenantId(rows[0].id);
  }, [tenantsQuery.data, scopeTenantId]);

  useEffect(() => {
    if (!canUseGlobalSearch) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (searchRef.current?.contains(e.target as Node)) return;
      setSearchResults(null);
      setSearchQuery("");
      setActiveIndex(0);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [canUseGlobalSearch]);

  useEffect(() => {
    if (!canUseGlobalSearch || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = encodeURIComponent(searchQuery.trim());
        const data = await adminApi.getJson<{
          users: Array<{ id: string; email: string; full_name: string | null; phone?: string | null }>;
          bookings: Array<{ id: string; booking_number: string; created_at?: string }>;
          providers: Array<{ id: string; business_name: string; owner_name?: string | null; owner_email?: string | null }>;
          leads?: Array<{ id: string; business_name: string | null; lead_name: string | null; email: string | null }>;
          onboarding_drafts?: Array<{ user_id: string; business_name: string | null; owner_email: string | null; owner_name: string | null }>;
        }>(`/api/admin/search?q=${q}`);
        setSearchResults(data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, canUseGlobalSearch]);

  const filteredNav = useMemo(() => {
    const role = bootstrap?.role as UserRole;
    if (!role) return [];
    const opts = {
      isSuperadmin: bootstrap?.isSuperadmin === true,
      canAccess,
      opsDesk: deskForAdminRole(role),
      isOpsManager: isOpsDeskManager(role),
    };
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .map((item) => filterNavTree(item, opts))
        .filter((item): item is NonNullable<typeof item> => item != null),
    })).filter((g) => g.items.length > 0);
  }, [bootstrap, canAccess]);

  type NavMatch = { title: string; href: string; group: string; icon: LucideIcon };

  /**
   * Client-side, instant page/navigation suggestions from the already
   * RBAC-filtered sidebar. Ranked: title-prefix > title-substring > group-match.
   */
  const navMatches = useMemo<NavMatch[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    const scored: Array<{ m: NavMatch; score: number }> = [];
    const seen = new Set<string>();
    for (const item of flattenNavItems(filteredNav)) {
      if (seen.has(item.href)) continue;
      const title = item.title.toLowerCase();
      const group_ = item.groupLabel.toLowerCase();
      let score = -1;
      if (title.startsWith(query)) score = 0;
      else if (title.includes(query)) score = 1;
      else if (group_.includes(query)) score = 2;
      if (score >= 0) {
        seen.add(item.href);
        scored.push({
          m: { title: item.title, href: item.href, group: item.groupLabel, icon: item.icon },
          score,
        });
      }
    }
    scored.sort((a, b) => (a.score - b.score) || a.m.title.localeCompare(b.m.title));
    return scored.slice(0, 6).map((s) => s.m);
  }, [searchQuery, filteredNav]);

  /** Flattened, ordered targets (nav first, then entities) for keyboard selection. */
  const flatResults = useMemo(() => {
    const items: Array<{ key: string; to: string }> = [];
    for (const n of navMatches) items.push({ key: `nav:${n.href}`, to: adminSpaTo(n.href) });
    for (const u of (searchResults?.users ?? []).slice(0, 5)) items.push({ key: `user:${u.id}`, to: adminSearchResultSpaPath("user", u.id) });
    for (const p of (searchResults?.providers ?? []).slice(0, 5)) items.push({ key: `provider:${p.id}`, to: adminSearchResultSpaPath("provider", p.id) });
    for (const b of (searchResults?.bookings ?? []).slice(0, 5)) items.push({ key: `booking:${b.id}`, to: adminSearchResultSpaPath("booking", b.id) });
    for (const l of (searchResults?.leads ?? []).slice(0, 5)) items.push({ key: `lead:${l.id}`, to: adminSearchResultSpaPath("lead", l.id) });
    for (const d of (searchResults?.onboarding_drafts ?? []).slice(0, 5)) items.push({ key: `draft:${d.user_id}`, to: adminSearchResultSpaPath("onboarding_draft", d.user_id) });
    return items;
  }, [navMatches, searchResults]);

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flatResults.forEach((r, i) => map.set(r.key, i));
    return map;
  }, [flatResults]);

  /** Keep the highlighted row valid as results stream in / change. */
  useEffect(() => {
    setActiveIndex((i) => (flatResults.length === 0 ? 0 : Math.min(i, flatResults.length - 1)));
  }, [flatResults.length]);

  const closeSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setActiveIndex(0);
  }, []);

  const onSearchKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.currentTarget.blur();
        closeSearch();
        return;
      }
      if (flatResults.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const target = flatResults[activeIndex] ?? flatResults[0];
        if (target) {
          e.preventDefault();
          navigate(target.to);
          if (searchQuery.trim().length >= 2) {
            pushRecentSearch({ query: searchQuery.trim(), label: target.to, to: target.to });
          }
          closeSearch();
        }
      }
    },
    [flatResults, activeIndex, navigate, closeSearch],
  );

  /** ⌘K / Ctrl+K opens the command palette from anywhere in the shell. */
  useEffect(() => {
    if (!canUseGlobalSearch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canUseGlobalSearch]);

  const recordSearchSelection = useCallback(
    (label: string, to: string) => {
      if (searchQuery.trim().length >= 2) {
        pushRecentSearch({ query: searchQuery.trim(), label, to });
      }
      closeSearch();
    },
    [searchQuery, closeSearch],
  );

  const navCounts = navCountsQuery.data ?? {};

  const canAccessSupport = canAccess(ADMIN_SECTION_SUPPORT);
  const canAccessUsersTrust = canAccess(ADMIN_SECTION_USERS_TRUST);

  // Realtime: refresh shell badges when queues or personal notifications change.
  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    if (!sb) return;
    const userId = bootstrap?.userId;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        invalidateAdminShellCounts(qc);
      }, 500);
    };

    const channels: ReturnType<typeof sb.channel>[] = [];
    if (userId) {
      channels.push(
        sb
          .channel(`admin-notifications:${userId}`)
          .on(
            "postgres_changes" as never,
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
            schedule,
          )
          .subscribe(),
      );
    }
    if (canAccessSupport) {
      channels.push(
        sb
          .channel("admin-shell-support-tickets")
          .on("postgres_changes" as never, { event: "*", schema: "public", table: "support_tickets" }, schedule)
          .subscribe(),
      );
    }
    if (userId) {
      channels.push(
        sb
          .channel("admin-shell-agent-actions")
          .on("postgres_changes" as never, { event: "*", schema: "public", table: "agent_actions" }, schedule)
          .subscribe(),
      );
    }
    if (canAccessUsersTrust) {
      channels.push(
        sb
          .channel("admin-shell-user-blocks")
          .on("postgres_changes" as never, { event: "*", schema: "public", table: "user_blocks" }, schedule)
          .subscribe(),
      );
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      for (const ch of channels) {
        try {
          sb.removeChannel(ch);
        } catch {
          // ignore
        }
      }
    };
  }, [bootstrap?.userId, canAccessSupport, canAccessUsersTrust, qc]);

  useEffect(() => {
    const hash = location.hash.replace(/^#/, "").trim();
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 transform border-r border-gray-200 bg-white transition-all md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "md:w-[4.5rem]" : "md:w-64",
          "w-64"
        )}
      >
        <div className={cn(
          "flex h-14 items-center border-b border-gray-100 font-semibold text-gray-900",
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4",
        )}>
          {sidebarCollapsed ? (
            <span className="text-primary text-lg">B</span>
          ) : (
            <div className="flex items-center">
              <span className="text-primary">Beautonomi</span>
              <span className="ml-1 text-gray-700">Admin</span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden md:inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className={cn(
          "max-h-[calc(100vh-3.5rem)] overflow-y-auto text-sm",
          sidebarCollapsed ? "p-1.5" : "p-3",
        )}>
          <AdminNavSidebar
            groups={filteredNav}
            navCounts={navCounts}
            sidebarCollapsed={sidebarCollapsed}
            pathname={location.pathname}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col md:pl-0">
        <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur-sm md:min-h-14 md:flex-nowrap md:gap-3 md:px-4 md:py-0">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-gray-600 hover:bg-gray-100 touch-manipulation md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {canUseGlobalSearch ? (
            <div ref={searchRef} className="relative min-w-0 flex-1 basis-full max-w-xl md:basis-auto">
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/90 px-3 shadow-sm focus-within:border-primary/40 focus-within:bg-white">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  ref={searchInputRef}
                  className="h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                  placeholder="Search pages, users, bookings, providers…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  role="combobox"
                  aria-expanded={searchQuery.trim().length >= 2}
                  aria-controls="admin-search-results"
                  aria-autocomplete="list"
                />
                <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline-flex">
                  ⌘K
                </kbd>
              </div>
              {searchQuery.trim().length >= 2 ? (
                <div
                  id="admin-search-results"
                  role="listbox"
                  className="absolute left-0 right-0 top-11 z-50 max-h-[28rem] overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
                >
                  <div className="p-2 text-sm">
                    {/* ── Pages / navigation (instant, client-side) ── */}
                    {navMatches.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Pages</div>
                        {navMatches.map((n) => {
                          const active = indexByKey.get(`nav:${n.href}`) === activeIndex;
                          return (
                            <Link
                              key={n.href}
                              to={adminSpaTo(n.href)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10 text-primary" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`nav:${n.href}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={closeSearch}
                            >
                              <n.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-gray-400")} />
                              <span className="min-w-0 flex-1 truncate">
                                <span className={cn("font-medium", active ? "text-primary" : "text-gray-900")}>
                                  {n.title}
                                </span>
                                <span className="ml-2 text-xs text-gray-400">{n.group}</span>
                              </span>
                              {active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary/70" /> : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* ── Records (users / providers / bookings) ── */}
                    {searchResults?.users?.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Users</div>
                        {searchResults.users.slice(0, 5).map((u) => {
                          const active = indexByKey.get(`user:${u.id}`) === activeIndex;
                          return (
                            <Link
                              key={u.id}
                              to={adminSearchResultSpaPath("user", u.id)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "block w-full min-h-11 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`user:${u.id}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={closeSearch}
                            >
                              <span className="font-medium text-gray-900">{u.full_name || "No name"}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {u.email}
                                {u.phone ? ` • ${u.phone}` : ""}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    {searchResults?.providers?.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Providers</div>
                        {searchResults.providers.slice(0, 5).map((p) => {
                          const active = indexByKey.get(`provider:${p.id}`) === activeIndex;
                          return (
                            <Link
                              key={p.id}
                              to={adminSearchResultSpaPath("provider", p.id)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "block w-full min-h-11 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`provider:${p.id}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={closeSearch}
                            >
                              <span className="font-medium text-gray-900">{p.business_name}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {p.owner_name || p.owner_email || ""}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    {searchResults?.bookings?.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Bookings</div>
                        {searchResults.bookings.slice(0, 5).map((b) => {
                          const active = indexByKey.get(`booking:${b.id}`) === activeIndex;
                          return (
                            <Link
                              key={b.id}
                              to={adminSearchResultSpaPath("booking", b.id)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "block w-full min-h-11 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`booking:${b.id}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={closeSearch}
                            >
                              <span className="font-medium text-gray-900">{b.booking_number}</span>
                              {b.created_at ? (
                                <span className="mt-0.5 block text-xs text-gray-500">
                                  {new Date(b.created_at).toLocaleDateString()}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}

                    {/* ── Status rows ── */}
                    {searching ? (
                      <div className="px-2 py-2 text-xs text-gray-400">Searching records…</div>
                    ) : null}
                    {searchResults?.leads?.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Provider leads</div>
                        {searchResults.leads.slice(0, 5).map((l) => {
                          const active = indexByKey.get(`lead:${l.id}`) === activeIndex;
                          const label = l.business_name || l.lead_name || l.email || l.id;
                          return (
                            <Link
                              key={l.id}
                              to={adminSearchResultSpaPath("lead", l.id)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "block w-full min-h-11 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`lead:${l.id}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={() => recordSearchSelection(label, adminSearchResultSpaPath("lead", l.id))}
                            >
                              <span className="font-medium text-gray-900">{label}</span>
                              {l.email ? <span className="mt-0.5 block text-xs text-gray-500">{l.email}</span> : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    {searchResults?.onboarding_drafts?.length ? (
                      <div className="mb-2">
                        <div className="px-2 py-1 text-xs font-medium text-gray-400">Onboarding drafts</div>
                        {searchResults.onboarding_drafts.slice(0, 5).map((d) => {
                          const active = indexByKey.get(`draft:${d.user_id}`) === activeIndex;
                          const label = d.business_name || d.owner_name || d.owner_email || d.user_id;
                          return (
                            <Link
                              key={d.user_id}
                              to={adminSearchResultSpaPath("onboarding_draft", d.user_id)}
                              role="option"
                              aria-selected={active}
                              className={cn(
                                "block w-full min-h-11 rounded-lg px-2 py-2 text-left",
                                active ? "bg-primary/10" : "hover:bg-gray-50",
                              )}
                              onMouseEnter={() => {
                                const idx = indexByKey.get(`draft:${d.user_id}`);
                                if (idx != null) setActiveIndex(idx);
                              }}
                              onClick={() =>
                                recordSearchSelection(label, adminSearchResultSpaPath("onboarding_draft", d.user_id))
                              }
                            >
                              <span className="font-medium text-gray-900">{label}</span>
                              {d.owner_email ? (
                                <span className="mt-0.5 block text-xs text-gray-500">{d.owner_email}</span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}

                    {!searching &&
                    !navMatches.length &&
                    !searchResults?.users?.length &&
                    !searchResults?.providers?.length &&
                    !searchResults?.bookings?.length &&
                    !searchResults?.leads?.length &&
                    !searchResults?.onboarding_drafts?.length ? (
                      <div className="p-3 text-gray-500">No results for “{searchQuery.trim()}”</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {bootstrap?.isSuperadmin ? (
            <div
              className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 md:w-auto"
              title="Superadmin: choose whether admin APIs use a specific tenant or global context where supported."
            >
              <select
                aria-label="Admin API scope mode"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm md:min-h-0 md:flex-none md:py-1.5"
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value as "tenant" | "global")}
              >
                <option value="tenant">Tenant scope</option>
                <option value="global">Global scope</option>
              </select>
              {scopeMode === "tenant" ? (
                tenantsQuery.isLoading ? (
                  <span className="min-h-11 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500 md:min-h-0 md:py-1.5">
                    Loading tenants…
                  </span>
                ) : tenantsQuery.isError ? (
                  <span className="max-w-[220px] text-xs text-amber-800" role="status">
                    Could not load tenants.{" "}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => void tenantsQuery.refetch()}
                    >
                      Retry
                    </button>
                  </span>
                ) : !(tenantsQuery.data ?? []).length ? (
                  <span className="text-xs text-gray-500" role="status">
                    No tenants
                  </span>
                ) : (
                  <select
                    aria-label="Tenant for scoped admin API requests"
                    className="min-h-11 min-w-0 flex-1 max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm md:max-w-[220px] md:min-h-0 md:flex-none md:py-1.5"
                    value={scopeTenantId}
                    onChange={(e) => setScopeTenantId(e.target.value)}
                  >
                    {(tenantsQuery.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.slug || t.id}
                      </option>
                    ))}
                  </select>
                )
              ) : null}
            </div>
          ) : null}

          <AdminNotificationBell />

          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium text-gray-900">{bootstrap?.fullName || bootstrap?.email}</div>
              <div className="text-gray-500">{bootstrap?.role}</div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-gray-600 hover:bg-gray-100 touch-manipulation"
              onClick={() => {
                qc.removeQueries({ queryKey: adminQueryKeys.root });
                void signOut().finally(() => {
                  navigate(adminSpaTo("/admin/login"), { replace: true });
                });
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {sectionPermissionsError ? (
          <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
          >
            Team permissions could not be loaded; sidebar uses code defaults and may not match the database
            matrix.{" "}
            <button
              type="button"
              className="font-medium underline decoration-amber-700 hover:text-amber-900"
              onClick={() => void refetchSectionPermissions()}
            >
              Retry
            </button>
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
            {isSectionPermissionsPending ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading permissions">
                <AdminPageSkeleton rows={8} />
                <p className="text-center text-sm text-gray-500">Loading team permissions…</p>
              </div>
            ) : (
              <AdminBreadcrumbProvider>
                <AdminBreadcrumbs />
                <Suspense
                  fallback={
                    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
                      <AdminPageSkeleton rows={8} />
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </AdminBreadcrumbProvider>
            )}
          </div>
        </main>
      </div>

      {canUseGlobalSearch ? (
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          navMatches={navMatches}
        />
      ) : null}
      <GlobalFloatingCopilot />
    </div>
  );
}
