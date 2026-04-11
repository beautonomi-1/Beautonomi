import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, LogOut, Search, Bell, ChevronDown } from "lucide-react";
import { AdminApiError } from "@beautonomi/admin-api-client";
import {
  ADMIN_SCOPE_STORAGE_KEY,
  ADMIN_SCOPE_TENANT_STORAGE_KEY,
} from "@beautonomi/admin-api-client";
import type { UserRole } from "@beautonomi/types";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { NAV_GROUPS } from "@/config/nav";
import { cn } from "@/lib/cn";
import { adminSearchResultSpaPath } from "@/lib/adminSearchSpaPaths";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
  });

  const tenantsQuery = useQuery({
    queryKey: adminQueryKeys.tenants(),
    queryFn: () => adminApi.getJson<Array<{ id: string; name?: string; slug?: string | null }>>("/api/admin/tenants"),
    enabled: bootstrap?.isSuperadmin === true,
    staleTime: 5 * 60_000,
  });

  const activityQuery = useQuery({
    queryKey: adminQueryKeys.activity(),
    queryFn: async () => {
      try {
        return await adminApi.getJson<{
          activities?: Array<{
            id: string;
            title?: string;
            message?: string;
            timestamp?: string;
            link?: string;
            priority?: string;
          }>;
          total_unread?: number;
        }>("/api/admin/activity");
      } catch (e) {
        if (e instanceof AdminApiError && (e.status === 401 || e.status === 403 || e.status >= 500)) {
          return {
            activities: [] as Array<{
              id: string;
              title?: string;
              message?: string;
              timestamp?: string;
              link?: string;
              priority?: string;
            }>,
            total_unread: 0,
          };
        }
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
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
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.superadminOnly && !bootstrap?.isSuperadmin) return false;
        return true;
      }),
    })).filter((g) => g.items.length > 0 && canAccess(g.section));
  }, [bootstrap, canAccess]);

  const navCounts = navCountsQuery.data ?? {};

  const activityData = activityQuery.data;
  const activityItems = activityData?.activities ?? [];
  const activityUnread = activityData?.total_unread ?? 0;

  /** `/admin/foo/bar?x=1` → root-absolute path under the admin basename (leading `/`). */
  const activityLinkTo = (href: string) => adminSpaTo(href);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-gray-200 bg-white transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center border-b border-gray-100 px-4 font-semibold text-gray-900">
          <span className="text-primary">Beautonomi</span>
          <span className="ml-1 text-gray-700">Admin</span>
        </div>
        <nav className="max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3 text-sm">
          {filteredNav.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const count = navCounts[item.href] ?? 0;
                  return (
                    <li key={item.href}>
                      <NavLink
                        to={adminSpaTo(item.href)}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-11 items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-gray-700 transition-colors hover:bg-primary/5 hover:text-gray-900 touch-manipulation",
                            isActive &&
                              "border-primary/15 bg-primary/10 font-medium text-primary shadow-sm"
                          )
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        {({ isActive }) => (
                          <>
                            <span className="flex items-center gap-2">
                              <item.icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  isActive ? "text-primary" : "text-gray-500 opacity-80"
                                )}
                              />
                              {item.title}
                            </span>
                            {count > 0 ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                {count}
                              </span>
                            ) : null}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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

      <div className="flex flex-1 flex-col md:pl-0">
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
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/90 px-3 shadow-sm">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  className="h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                  placeholder="Search users, bookings, providers…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searchQuery.trim().length >= 2 ? (
                <div className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {searching ? (
                    <div className="p-3 text-sm text-gray-500">Searching…</div>
                  ) : searchResults ? (
                    <div className="p-2 text-sm">
                      {searchResults.users?.length ? (
                        <div className="mb-2">
                          <div className="px-2 py-1 text-xs font-medium text-gray-400">Users</div>
                          {searchResults.users.slice(0, 5).map((u) => (
                            <Link
                              key={u.id}
                              to={adminSearchResultSpaPath("user", u.id)}
                              className="block w-full min-h-11 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                              onClick={() => {
                                setSearchQuery("");
                                setSearchResults(null);
                              }}
                            >
                              <span className="font-medium text-gray-900">{u.full_name || "No name"}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {u.email}
                                {u.phone ? ` • ${u.phone}` : ""}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {searchResults.providers?.length ? (
                        <div className="mb-2">
                          <div className="px-2 py-1 text-xs font-medium text-gray-400">Providers</div>
                          {searchResults.providers.slice(0, 5).map((p) => (
                            <Link
                              key={p.id}
                              to={adminSearchResultSpaPath("provider", p.id)}
                              className="block w-full min-h-11 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                              onClick={() => {
                                setSearchQuery("");
                                setSearchResults(null);
                              }}
                            >
                              <span className="font-medium text-gray-900">{p.business_name}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {p.owner_name || p.owner_email || ""}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {searchResults.bookings?.length ? (
                        <div>
                          <div className="px-2 py-1 text-xs font-medium text-gray-400">Bookings</div>
                          {searchResults.bookings.slice(0, 5).map((b) => (
                            <Link
                              key={b.id}
                              to={adminSearchResultSpaPath("booking", b.id)}
                              className="block w-full min-h-11 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                              onClick={() => {
                                setSearchQuery("");
                                setSearchResults(null);
                              }}
                            >
                              <span className="font-medium text-gray-900">{b.booking_number}</span>
                              {b.created_at ? (
                                <span className="mt-0.5 block text-xs text-gray-500">
                                  {new Date(b.created_at).toLocaleDateString()}
                                </span>
                              ) : null}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {!searching &&
                      !searchResults.users?.length &&
                      !searchResults.providers?.length &&
                      !searchResults.bookings?.length ? (
                        <div className="p-3 text-gray-500">No results</div>
                      ) : null}
                    </div>
                  ) : null}
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

          <details className="relative">
            <summary
              className="relative flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 rounded-xl p-2 hover:bg-gray-100 touch-manipulation"
              aria-label={
                activityUnread > 0
                  ? `Notifications, ${activityUnread} items needing attention`
                  : "Notifications"
              }
            >
              <Bell className="h-5 w-5 text-gray-600" aria-hidden />
              {activityUnread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
                  {activityUnread > 99 ? "99+" : activityUnread}
                </span>
              ) : null}
              <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" aria-hidden />
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-80 max-h-[min(24rem,70vh)] overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-lg">
              {activityQuery.isLoading ? (
                <p className="text-gray-500">Loading…</p>
              ) : activityQuery.isError ? (
                <p className="text-gray-500">Activity unavailable</p>
              ) : activityItems.length === 0 ? (
                <p className="text-gray-500">No items needing attention in the feed.</p>
              ) : (
                <ul className="space-y-1">
                  {activityItems.slice(0, 12).map((a) => {
                    const to = a.link ? activityLinkTo(a.link) : "/dashboard";
                    const primary = a.title ?? "Update";
                    const body = a.message ?? a.id;
                    return (
                      <li key={a.id}>
                        <Link
                          to={to}
                          className="block rounded-lg px-2 py-2 text-left text-gray-800 hover:bg-primary/5"
                          onClick={(e) => {
                            const details = (e.currentTarget.closest("details") as HTMLDetailsElement | null);
                            if (details) details.open = false;
                          }}
                        >
                          <span className="font-medium text-gray-900">{primary}</span>
                          <span className="mt-0.5 block text-gray-600">{body}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </details>

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

        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-[1600px]">
            {isSectionPermissionsPending ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading permissions">
                <AdminPageSkeleton rows={8} />
                <p className="text-center text-sm text-gray-500">Loading team permissions…</p>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="space-y-4" aria-busy="true" aria-label="Loading page">
                    <AdminPageSkeleton rows={8} />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
