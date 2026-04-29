"use client";

/**
 * Legacy admin chrome (sidebar, nav counts, search). Used only by `app/admin/layout.tsx` when
 * Next serves embedded admin pages — not used by the Vite SPA (`apps/admin-web`).
 */
import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Image as ImageIcon,
  Tag,
  Gift,
  FileText,
  Users,
  DollarSign,
  Wallet,
  Award,
  Bell,
  Settings,
  FileSearch,
  Menu,
  Search,
  ChevronDown,
  LogOut,
  User,
  Globe,
  Globe2,
  Map,
  ShieldCheck,
  ToggleLeft,
  CreditCard,
  Eye,
  Star,
  AlertCircle,
  Flag,
  RotateCcw,
  BarChart3,
  Activity,
  Shield,
  Receipt,
  UserCheck,
  MessageSquare,
  TrendingUp,
  Zap,
  Coins,
  Medal,
  ShoppingBag,
  Undo2,
  Store,
  Layers,
  GraduationCap,
  Smartphone,
  Link2,
  Network,
  Share2,
  FolderOpen,
  MapPinned,
  Boxes,
  ShieldAlert,
  Megaphone,
  MapPin,
  ClipboardList,
  UserPlus,
  Kanban,
  Radio,
  CheckCircle2,
  Copy,
  Settings2,
  Plug,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NotificationsDropdown from "./NotificationsDropdown";
import { fetcher } from "@/lib/http/fetcher";
import {
  canAccessSection,
  ALL_ADMIN_ROLES,
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_CONTENT_CATALOG,
  ADMIN_SECTION_ECOMMERCE,
  ADMIN_SECTION_MARKETING_COMMS,
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_OPERATIONS,
  ADMIN_SECTION_PLATFORM_CONFIG,
  ADMIN_SECTION_PROVIDER_OPS,
} from "@/lib/admin-sections";
import type { AdminSection } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** When true, link is only shown for superadmin. */
  superadminOnly?: boolean;
}

interface NavGroup {
  label: string;
  section: AdminSection;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    section: ADMIN_SECTION_OVERVIEW,
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { title: "Gods Eye", href: "/admin/gods-eye", icon: Eye },
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { title: "Geo & Devices", href: "/admin/analytics/geo", icon: MapPin },
      { title: "Reports", href: "/admin/reports", icon: FileText },
    ],
  },
  {
    label: "Support",
    section: ADMIN_SECTION_SUPPORT,
    items: [{ title: "Support Tickets", href: "/admin/support-tickets", icon: AlertCircle }],
  },
  {
    label: "Providers & operations",
    section: ADMIN_SECTION_PROVIDERS_OPERATIONS,
    items: [
      { title: "Providers", href: "/admin/providers", icon: Building2 },
      { title: "Provider distance", href: "/admin/providers/distance-settings", icon: MapPinned },
      { title: "Staff", href: "/admin/staff", icon: UserCheck },
      { title: "Bookings", href: "/admin/bookings", icon: Calendar },
      { title: "Reviews", href: "/admin/reviews", icon: Star },
      { title: "Disputes", href: "/admin/disputes", icon: AlertCircle },
      { title: "User Reports", href: "/admin/user-reports", icon: Flag },
      { title: "Refunds", href: "/admin/refunds", icon: RotateCcw },
    ],
  },
  {
    label: "Provider Ops",
    section: ADMIN_SECTION_PROVIDER_OPS,
    items: [
      { title: "Ops Dashboard", href: "/admin/provider-ops", icon: Radio },
      { title: "Onboarding Tracker", href: "/admin/provider-ops/tracker", icon: ClipboardList },
      { title: "Lead Inbox", href: "/admin/provider-ops/leads", icon: UserPlus },
      { title: "Pipeline Board", href: "/admin/provider-ops/pipeline", icon: Kanban },
      { title: "Activation Queue", href: "/admin/provider-ops/activation", icon: CheckCircle2 },
      { title: "Duplicate Review", href: "/admin/provider-ops/duplicates", icon: Copy },
      { title: "Reports", href: "/admin/provider-ops/reports", icon: BarChart3 },
      { title: "Settings", href: "/admin/provider-ops/settings", icon: Settings2 },
    ],
  },
  {
    label: "Finance",
    section: ADMIN_SECTION_FINANCE,
    items: [
      { title: "Finance", href: "/admin/finance", icon: DollarSign },
      { title: "Payouts", href: "/admin/payouts", icon: Wallet },
      { title: "Fee Management", href: "/admin/fees", icon: CreditCard },
      { title: "Platform Fees", href: "/admin/settings/platform-fees", icon: DollarSign },
      { title: "Taxes", href: "/admin/taxes", icon: Receipt },
      { title: "Plans", href: "/admin/plans", icon: CreditCard, superadminOnly: true },
      { title: "Provider Subscriptions", href: "/admin/provider-subscriptions", icon: CreditCard, superadminOnly: true },
      { title: "Subscription Revenue", href: "/admin/subscription-revenue", icon: TrendingUp, superadminOnly: true },
      { title: "Billing", href: "/admin/billing", icon: CreditCard, superadminOnly: true },
    ],
  },
  {
    label: "Users & trust",
    section: ADMIN_SECTION_USERS_TRUST,
    items: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
      { title: "Audit Logs", href: "/admin/audit-logs", icon: FileSearch },
    ],
  },
  {
    label: "Content & catalog",
    section: ADMIN_SECTION_CONTENT_CATALOG,
    items: [
      { title: "Content", href: "/admin/content", icon: FileText },
      { title: "Learning Center", href: "/admin/content/learning", icon: GraduationCap },
      { title: "CMS resources", href: "/admin/content/resources", icon: FolderOpen },
      { title: "Catalog", href: "/admin/catalog", icon: Tag },
      { title: "Global categories", href: "/admin/catalog/global-categories", icon: Globe2 },
      { title: "Explore", href: "/admin/explore", icon: ImageIcon },
      { title: "Add-ons", href: "/admin/addons", icon: Boxes },
    ],
  },
  {
    label: "E‑commerce",
    section: ADMIN_SECTION_ECOMMERCE,
    items: [
      { title: "Product Orders", href: "/admin/ecommerce/orders", icon: ShoppingBag },
      { title: "Product Returns", href: "/admin/ecommerce/returns", icon: Undo2 },
      { title: "Product Catalog", href: "/admin/ecommerce/products", icon: Store },
    ],
  },
  {
    label: "Marketing & comms",
    section: ADMIN_SECTION_MARKETING_COMMS,
    items: [
      { title: "Ads & Campaigns", href: "/admin/ads", icon: Megaphone },
      { title: "Promotions", href: "/admin/promotions", icon: Gift },
      { title: "Loyalty", href: "/admin/loyalty", icon: Award },
      { title: "Point rules", href: "/admin/gamification/point-rules", icon: Coins },
      { title: "Provider badges", href: "/admin/gamification/badges", icon: Medal },
      { title: "Gift Cards", href: "/admin/gift-cards", icon: Gift },
      { title: "Notifications", href: "/admin/notifications", icon: Bell },
      { title: "Broadcast", href: "/admin/broadcast", icon: MessageSquare },
      { title: "Marketing Automations", href: "/admin/automations", icon: Zap },
      { title: "Notification Templates", href: "/admin/notification-templates", icon: Bell },
    ],
  },
  {
    label: "Integrations & dev",
    section: ADMIN_SECTION_INTEGRATIONS_DEV,
    items: [
      { title: "Webhooks", href: "/admin/webhooks", icon: Globe },
      { title: "API Keys", href: "/admin/api-keys", icon: Shield },
      {
        title: "Integrations hub",
        href: "/admin/control-plane/integrations",
        icon: Plug,
        superadminOnly: true,
      },
      {
        title: "Sumsub",
        href: "/admin/control-plane/integrations/sumsub",
        icon: ShieldCheck,
        superadminOnly: true,
      },
      {
        title: "Gemini",
        href: "/admin/control-plane/integrations/gemini",
        icon: Sparkles,
        superadminOnly: true,
      },
      {
        title: "Aura",
        href: "/admin/control-plane/integrations/aura",
        icon: Zap,
        superadminOnly: true,
      },
      { title: "Amplitude", href: "/admin/integrations/amplitude", icon: BarChart3 },
      { title: "Mapbox", href: "/admin/mapbox", icon: Map },
      { title: "ISO Codes", href: "/admin/iso-codes", icon: Globe },
    ],
  },
  {
    label: "Operations",
    section: ADMIN_SECTION_OPERATIONS,
    items: [
      { title: "Market Coverage", href: "/admin/service-zones", icon: Globe2 },
      { title: "System Health", href: "/admin/system-health", icon: Activity },
      { title: "Monitoring", href: "/admin/monitoring", icon: Activity },
      { title: "Security", href: "/admin/security", icon: Shield },
    ],
  },
  {
    label: "Platform config",
    section: ADMIN_SECTION_PLATFORM_CONFIG,
    items: [
      { title: "Settings", href: "/admin/settings", icon: Settings },
      { title: "Tenant domains", href: "/admin/settings/tenant-domains", icon: Network, superadminOnly: true },
      { title: "Control Plane", href: "/admin/control-plane/overview", icon: Layers },
      {
        title: "Compliance purge",
        href: "/admin/control-plane/compliance",
        icon: ShieldAlert,
        superadminOnly: true,
      },
      { title: "Feature Flags", href: "/admin/settings/feature-flags", icon: ToggleLeft },
      { title: "Custom Fields", href: "/admin/custom-fields", icon: FileText },
      { title: "App Version", href: "/admin/settings/app-version", icon: Smartphone },
      { title: "Referral Settings", href: "/admin/settings/referrals", icon: Link2 },
      { title: "Referral sources", href: "/admin/referral-sources", icon: Share2 },
      { title: "Team permissions", href: "/admin/settings/team-permissions", icon: Shield, superadminOnly: true },
    ],
  },
];

interface SearchResult {
  users: Array<{ id: string; email: string; phone: string | null; full_name: string | null; role: string }>;
  bookings: Array<{ id: string; booking_number: string; customer_id: string; provider_id: string | null; status: string; created_at: string; customer_name?: string | null; customer_email?: string | null; provider_name?: string | null }>;
  providers: Array<{ id: string; business_name: string; owner_name: string | null; owner_email: string | null; phone?: string | null; status: string }>;
}

/** Read the last-known role from local/session storage for use during auth hydration. */
function readCachedRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  // 1. Try sessionStorage first (written by AuthProvider on every successful auth; cleared on tab close)
  try {
    const raw = sessionStorage.getItem("user_role_cache");
    if (raw) {
      const parsed = JSON.parse(raw) as { role?: UserRole; timestamp?: number };
      if (parsed.role && parsed.timestamp && Date.now() - parsed.timestamp < 60 * 60 * 1000) {
        return parsed.role;
      }
    }
  } catch { /* ignore */ }
  // 2. Fall back to localStorage (survives tab close; 24 h TTL)
  try {
    const raw = localStorage.getItem("beautonomi_auth_cache");
    if (raw) {
      const parsed = JSON.parse(raw) as { role?: UserRole; timestamp?: number };
      if (parsed.role && parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return parsed.role;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const _router = useRouter();
  const { user, signOut, role: authRole } = useAuth();

  /**
   * Cached role is read synchronously via a lazy useState initializer so it is
   * available on the very first render — before AuthProvider has finished
   * re-validating the session.  This prevents "Tenant domains" and other
   * superadminOnly nav items from disappearing during the auth hydration window.
   */
  const [cachedRole] = useState<UserRole | null>(readCachedRole);

  /**
   * Prefer the live role from AuthProvider; fall back to cached role during
   * the brief window where user/authRole are both null (e.g. after navigation).
   */
  const sidebarRole = (user?.role ?? authRole ?? cachedRole) as UserRole | undefined;
  const isSuperadminSidebar =
    sidebarRole === "superadmin" || String(sidebarRole ?? "").toLowerCase() === "superadmin";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [navCounts, setNavCounts] = useState<Record<string, number>>({});
  const [effectiveSectionRoles, setEffectiveSectionRoles] = useState<Record<string, string[]> | null>(null);
  const [adminScopeMode, setAdminScopeMode] = useState<"tenant" | "global">("tenant");
  const [adminScopeTenantId, setAdminScopeTenantId] = useState("");
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string; slug?: string | null }>>([]);
  const adminRole = user?.role as UserRole | undefined;
  const canUseGlobalSearch = useMemo(() => {
    if (!adminRole || !ALL_ADMIN_ROLES.includes(adminRole)) return false;
    if (adminRole === "superadmin") return true;
    return canAccessSection(
      adminRole,
      ADMIN_SECTION_OVERVIEW,
      effectiveSectionRoles ?? undefined
    );
  }, [adminRole, effectiveSectionRoles]);

  // Debounce search
  useEffect(() => {
    if (!canUseGlobalSearch) {
      setSearchResults(null);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await fetcher.get<{ data: SearchResult }>(
          `/api/admin/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSearchResults(response.data);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults(null);
        setSearchError("Search failed. Please try again.");
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, canUseGlobalSearch]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch nav counts for sidebar badges (verifications, payouts, support tickets, refunds, disputes)
  useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{ data: Record<string, number> }>("/api/admin/nav-counts")
      .then((res) => {
        if (!cancelled && res?.data) setNavCounts(res.data);
      })
      .catch((err) => {
        console.error("Failed to load nav counts:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]); // refetch when navigating so counts stay fresh after actions

  // Fetch effective section roles so sidebar only shows sections the user can access (per DB matrix).
  // Refetch on pathname change so sidebar updates after superadmin saves on team-permissions.
  useEffect(() => {
    if (!adminRole || !ALL_ADMIN_ROLES.includes(adminRole)) {
      setEffectiveSectionRoles(null);
      return;
    }
    let cancelled = false;
    fetcher
      .get<{ data: { sectionRoles: Record<string, string[]> } }>("/api/admin/settings/section-permissions")
      .then((res) => {
        if (!cancelled && res?.data?.sectionRoles) setEffectiveSectionRoles(res.data.sectionRoles);
      })
      .catch(() => {
        if (!cancelled) setEffectiveSectionRoles(null);
      });
    return () => {
      cancelled = true;
    };
  }, [adminRole, pathname]);

  // Superadmin-only scope controls for settings/content/template customization.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mode = window.localStorage.getItem("admin_scope_mode");
    const tenant = window.localStorage.getItem("admin_scope_tenant_id");
    if (mode === "global" || mode === "tenant") setAdminScopeMode(mode);
    if (tenant) setAdminScopeTenantId(tenant);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("admin_scope_mode", adminScopeMode);
    if (adminScopeTenantId) {
      window.localStorage.setItem("admin_scope_tenant_id", adminScopeTenantId);
    }
  }, [adminScopeMode, adminScopeTenantId]);

  useEffect(() => {
    if (!isSuperadminSidebar) return;
    let cancelled = false;
    fetcher
      .get<{ data?: Array<{ id: string; name?: string; slug?: string | null }> }>("/api/admin/tenants")
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setTenantOptions(
          rows.map((t) => ({ id: t.id, name: t.name || t.slug || t.id, slug: t.slug ?? null }))
        );
        if (!adminScopeTenantId && rows[0]?.id) {
          setAdminScopeTenantId(rows[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load tenants:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadminSidebar, adminScopeTenantId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (canUseGlobalSearch && searchQuery.trim().length >= 2) {
      setShowResults(true);
    }
  };

  const totalResults = searchResults
    ? searchResults.users.length + searchResults.bookings.length + searchResults.providers.length
    : 0;

  const handleLogout = async () => {
    await signOut();
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "A";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev";

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden w-full max-w-full">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b w-full overflow-x-hidden">
        <div className="flex flex-col gap-2 px-4 py-3 w-full max-w-full overflow-x-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-lg">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-white">
                  <SidebarContent
                    pathname={pathname}
                    onNavigate={() => setSidebarOpen(false)}
                    navCounts={navCounts}
                    role={sidebarRole}
                    isSuperadmin={isSuperadminSidebar}
                    effectiveSectionRoles={effectiveSectionRoles}
                  />
                </SheetContent>
              </Sheet>
              <Link href="/admin/dashboard" className="font-semibold text-lg">
                Beautonomi Admin
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={environment === "prod" ? "destructive" : "outline"}
                className={`text-xs ${
                  environment === "dev"
                    ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                    : ""
                }`}
              >
                {environment}
              </Badge>
              <UserMenu user={user} onLogout={handleLogout} getInitials={getInitials} />
            </div>
          </div>
          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder={canUseGlobalSearch ? "Search..." : "Search unavailable for your role"}
                value={searchQuery}
                disabled={!canUseGlobalSearch}
                onChange={(e) => {
                  if (!canUseGlobalSearch) return;
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length >= 2) {
                    setShowResults(true);
                  }
                }}
                onFocus={() => {
                  if (!canUseGlobalSearch) return;
                  if (searchQuery.trim().length >= 2 && searchResults) {
                    setShowResults(true);
                  }
                }}
                className="pl-10"
              />
              {showResults && searchQuery.trim().length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
                  {isSearching ? (
                    <div className="p-4 text-center text-gray-500">Searching...</div>
                  ) : searchError ? (
                    <div className="p-4 text-center text-red-500">{searchError}</div>
                  ) : totalResults === 0 ? (
                    <div className="p-4 text-center text-gray-500">No results found</div>
                  ) : searchResults ? (
                    <div className="py-2">
                      {searchResults.users.length > 0 && (
                        <div>
                          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                            Users ({searchResults.users.length})
                          </div>
                          {searchResults.users.map((user) => (
                            <Link
                              key={user.id}
                              href={`/admin/users/${user.id}`}
                              onClick={() => {
                                setShowResults(false);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                            >
                              <Users className="w-4 h-4 text-gray-400" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.full_name || "No name"}
                                  <span className="ml-2 text-[10px] text-gray-400 font-normal">{user.role}</span>
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {user.email}{user.phone ? ` · ${user.phone}` : ""}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults.bookings.length > 0 && (
                        <div>
                          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                            Bookings ({searchResults.bookings.length})
                          </div>
                          {searchResults.bookings.map((booking) => (
                            <Link
                              key={booking.id}
                              href={`/admin/bookings/${booking.id}`}
                              onClick={() => {
                                setShowResults(false);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                            >
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  #{booking.booking_number}
                                  <span className="ml-2 text-[10px] text-gray-400 font-normal">{booking.status}</span>
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {booking.customer_name || booking.customer_email || "Customer"}{booking.provider_name ? ` → ${booking.provider_name}` : ""} · {new Date(booking.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchResults.providers.length > 0 && (
                        <div>
                          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                            Providers ({searchResults.providers.length})
                          </div>
                          {searchResults.providers.map((provider) => (
                            <Link
                              key={provider.id}
                              href={`/admin/providers/${provider.id}`}
                              onClick={() => {
                                setShowResults(false);
                                setSearchQuery("");
                              }}
                              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                            >
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {provider.business_name}
                                  <span className="ml-2 text-[10px] text-gray-400 font-normal">{provider.status}</span>
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {provider.owner_email || provider.owner_name || ""}{provider.phone ? ` · ${provider.phone}` : ""}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="flex w-full overflow-x-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-50 bg-white border-r overflow-x-hidden">
          <SidebarContent
            pathname={pathname}
            navCounts={navCounts}
            role={sidebarRole}
            isSuperadmin={isSuperadminSidebar}
            effectiveSectionRoles={effectiveSectionRoles}
          />
        </aside>

        {/* Main Content */}
        <div className="flex-1 lg:pl-64 w-full overflow-x-hidden">
          {/* Desktop Topbar */}
          <div className="hidden lg:block sticky top-0 z-30 bg-white border-b w-full overflow-x-hidden">
            <div className="flex items-center justify-between px-6 py-4 w-full max-w-full overflow-x-hidden">
              <form onSubmit={handleSearch} className="flex-1 max-w-md">
                <div className="relative" ref={searchRef}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder={
                      canUseGlobalSearch
                        ? "Search users, bookings, providers..."
                        : "Search unavailable for your role"
                    }
                    value={searchQuery}
                    disabled={!canUseGlobalSearch}
                    onChange={(e) => {
                      if (!canUseGlobalSearch) return;
                      setSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) {
                        setShowResults(true);
                      }
                    }}
                    onFocus={() => {
                      if (!canUseGlobalSearch) return;
                      if (searchQuery.trim().length >= 2 && searchResults) {
                        setShowResults(true);
                      }
                    }}
                    className="pl-10"
                  />
                  {showResults && searchQuery.trim().length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                      {isSearching ? (
                        <div className="p-4 text-center text-gray-500">Searching...</div>
                      ) : searchError ? (
                        <div className="p-4 text-center text-red-500">{searchError}</div>
                      ) : totalResults === 0 ? (
                        <div className="p-4 text-center text-gray-500">No results found</div>
                      ) : (
                        <div className="py-2">
                          {searchResults.users.length > 0 && (
                            <div>
                              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                                Users ({searchResults.users.length})
                              </div>
                              {searchResults.users.map((user) => (
                                <Link
                                  key={user.id}
                                  href={`/admin/users?highlight=${user.id}`}
                                  onClick={() => {
                                    setShowResults(false);
                                    setSearchQuery("");
                                  }}
                                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                                >
                                  <Users className="w-4 h-4 text-gray-400" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                      {user.full_name || "No name"}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {user.email} {user.phone ? `• ${user.phone}` : ""}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    {user.role}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          )}
                          {searchResults.bookings.length > 0 && (
                            <div>
                              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                                Bookings ({searchResults.bookings.length})
                              </div>
                              {searchResults.bookings.map((booking) => (
                                <Link
                                  key={booking.id}
                                  href={`/admin/bookings?highlight=${booking.id}`}
                                  onClick={() => {
                                    setShowResults(false);
                                    setSearchQuery("");
                                  }}
                                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                                >
                                  <Calendar className="w-4 h-4 text-gray-400" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                      {booking.booking_number}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {new Date(booking.created_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <Badge
                                    variant={
                                      booking.status === "confirmed"
                                        ? "default"
                                        : booking.status === "cancelled"
                                        ? "destructive"
                                        : "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {booking.status}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          )}
                          {searchResults.providers.length > 0 && (
                            <div>
                              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                                Providers ({searchResults.providers.length})
                              </div>
                              {searchResults.providers.map((provider) => (
                                <Link
                                  key={provider.id}
                                  href={`/admin/providers?highlight=${provider.id}`}
                                  onClick={() => {
                                    setShowResults(false);
                                    setSearchQuery("");
                                  }}
                                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                                >
                                  <Building2 className="w-4 h-4 text-gray-400" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                      {provider.business_name}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                      {provider.owner_name || provider.owner_email || ""}
                                    </div>
                                  </div>
                                  <Badge
                                    variant={provider.status === "active" ? "default" : "outline"}
                                    className="text-xs"
                                  >
                                    {provider.status}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </form>
              <div className="flex items-center gap-4">
                {isSuperadminSidebar && (
                  <div className="flex items-center gap-2 rounded-lg border px-2 py-1 bg-gray-50">
                    <span className="text-xs text-gray-600">Scope</span>
                    <select
                      className="text-xs bg-white border rounded px-2 py-1"
                      value={adminScopeMode}
                      onChange={(e) => setAdminScopeMode(e.target.value === "global" ? "global" : "tenant")}
                    >
                      <option value="tenant">Tenant override</option>
                      <option value="global">Global default</option>
                    </select>
                    {adminScopeMode === "tenant" && (
                      <select
                        className="text-xs bg-white border rounded px-2 py-1 max-w-[220px]"
                        value={adminScopeTenantId}
                        onChange={(e) => setAdminScopeTenantId(e.target.value)}
                      >
                        {tenantOptions.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <NotificationsDropdown />
                <Badge
                  variant={environment === "prod" ? "destructive" : "outline"}
                  className={`text-xs ${
                    environment === "dev"
                      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                      : ""
                  }`}
                >
                  {environment}
                </Badge>
                <UserMenu user={user} onLogout={handleLogout} getInitials={getInitials} />
              </div>
            </div>
          </div>

          {/* Page Content */}
          <main className="p-4 lg:p-6 w-full max-w-full overflow-x-hidden">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
  navCounts = {},
  role,
  isSuperadmin = false,
  effectiveSectionRoles = null,
}: {
  pathname: string;
  onNavigate?: () => void;
  navCounts?: Record<string, number>;
  role?: UserRole;
  /** Prefer explicit flag so superadmin-only nav shows when user.role is briefly stale. */
  isSuperadmin?: boolean;
  /** When set, sidebar uses DB matrix; otherwise uses code defaults. */
  effectiveSectionRoles?: Record<string, string[]> | null;
}) {
  const visibleGroups = role
    ? navGroups.filter((group) => canAccessSection(role, group.section, effectiveSectionRoles ?? undefined))
    : navGroups;
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <Link
          href="/admin/dashboard"
          className="font-semibold text-lg"
          onClick={onNavigate}
        >
          Beautonomi Admin
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items
                .filter((item) => !item.superadminOnly || isSuperadmin || role === "superadmin")
                .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const count = navCounts[item.href] ?? item.badge ?? 0;
                const showBadge = count > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-pink-50 text-pink-600"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate flex-1 min-w-0">{item.title}</span>
                    {showBadge && (
                      <Badge variant="secondary" className="ml-auto shrink-0 min-w-[1.25rem] justify-center bg-amber-100 text-amber-800 hover:bg-amber-100">
                        {count > 99 ? "99+" : count}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}

function UserMenu({
  user,
  onLogout,
  getInitials,
}: {
  user: { full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
  onLogout: () => void;
  getInitials: (name: string | null | undefined) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 p-1.5 rounded-lg h-auto">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="bg-pink-100 text-pink-600">
              {getInitials(user?.full_name || user?.email || null)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="w-4 h-4 text-gray-600 hidden lg:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{user?.full_name || "Admin"}</span>
            <span className="text-xs text-gray-500">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Platform Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account-settings" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-red-600">
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
