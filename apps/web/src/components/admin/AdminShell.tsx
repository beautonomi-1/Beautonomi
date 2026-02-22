"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Mail,
  MessageSquare,
  TrendingUp,
  Crown,
  Zap,
  Coins,
  ShoppingBag,
  Undo2,
  Store,
  Layers,
  Smartphone,
  Link2,
  Percent,
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NotificationsDropdown from "./NotificationsDropdown";
import { fetcher } from "@/lib/http/fetcher";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Gods Eye", href: "/admin/gods-eye", icon: Eye },
  { title: "Providers", href: "/admin/providers", icon: Building2 },
  { title: "Bookings", href: "/admin/bookings", icon: Calendar },
  { title: "Reviews", href: "/admin/reviews", icon: Star },
  { title: "Disputes", href: "/admin/disputes", icon: AlertCircle },
  { title: "User Reports", href: "/admin/user-reports", icon: Flag },
  { title: "Refunds", href: "/admin/refunds", icon: RotateCcw },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { title: "Reports", href: "/admin/reports", icon: FileText },
  { title: "System Health", href: "/admin/system-health", icon: BarChart3 },
  { title: "Monitoring", href: "/admin/monitoring", icon: Activity },
  { title: "Security", href: "/admin/security", icon: Shield },
  { title: "API Keys", href: "/admin/api-keys", icon: Shield },
  { title: "Amplitude", href: "/admin/integrations/amplitude", icon: BarChart3 },
  { title: "Webhooks", href: "/admin/webhooks", icon: Globe },
  { title: "Gift Cards", href: "/admin/gift-cards", icon: Gift },
  { title: "Support Tickets", href: "/admin/support-tickets", icon: AlertCircle },
  { title: "Product Orders", href: "/admin/ecommerce/orders", icon: ShoppingBag },
  { title: "Product Returns", href: "/admin/ecommerce/returns", icon: Undo2 },
  { title: "Product Catalog", href: "/admin/ecommerce/products", icon: Store },
  { title: "Catalog", href: "/admin/catalog", icon: Tag },
  { title: "Promotions", href: "/admin/promotions", icon: Gift },
  { title: "Loyalty", href: "/admin/loyalty", icon: Award },
  { title: "Point rules", href: "/admin/gamification/point-rules", icon: Coins },
  { title: "Content", href: "/admin/content", icon: FileText },
  { title: "Explore", href: "/admin/explore", icon: ImageIcon },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
  { title: "Finance", href: "/admin/finance", icon: DollarSign },
  { title: "Fee Management", href: "/admin/fees", icon: CreditCard },
  { title: "Payouts", href: "/admin/payouts", icon: Wallet },
  { title: "Notifications", href: "/admin/notifications", icon: Bell },
  { title: "Broadcast", href: "/admin/broadcast", icon: MessageSquare },
  { title: "Marketing Automations", href: "/admin/automations", icon: Zap },
  { title: "Email Templates", href: "/admin/email-templates", icon: Mail },
  { title: "SMS Templates", href: "/admin/sms-templates", icon: MessageSquare },
  { title: "Taxes", href: "/admin/taxes", icon: Receipt },
  { title: "Staff", href: "/admin/staff", icon: UserCheck },
  { title: "Audit Logs", href: "/admin/audit-logs", icon: FileSearch },
  { title: "ISO Codes", href: "/admin/iso-codes", icon: Globe },
  { title: "Mapbox", href: "/admin/mapbox", icon: Map },
  { title: "Control Plane", href: "/admin/control-plane/overview", icon: Settings },
  { title: "Feature Flags", href: "/admin/settings/feature-flags", icon: ToggleLeft },
  { title: "Subscription Plans", href: "/admin/subscription-plans", icon: CreditCard },
  { title: "Subscription Revenue", href: "/admin/subscription-revenue", icon: TrendingUp },
  { title: "Provider Subscriptions", href: "/admin/provider-subscriptions", icon: CreditCard },
  { title: "Custom Fields", href: "/admin/custom-fields", icon: FileText },
  { title: "Memberships", href: "/admin/memberships", icon: Crown },
  { title: "Addons", href: "/admin/addons", icon: Layers },
  { title: "Billing", href: "/admin/billing", icon: CreditCard },
  { title: "Pricing Plans", href: "/admin/pricing-plans", icon: Percent },
  { title: "Notification Templates", href: "/admin/notification-templates", icon: Bell },
  { title: "App Version", href: "/admin/settings/app-version", icon: Smartphone },
  { title: "Platform Fees", href: "/admin/settings/platform-fees", icon: DollarSign },
  { title: "Referral Settings", href: "/admin/settings/referrals", icon: Link2 },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

interface SearchResult {
  users: Array<{ id: string; email: string; phone: string | null; full_name: string | null; role: string }>;
  bookings: Array<{ id: string; booking_number: string; customer_id: string; provider_id: string | null; status: string; created_at: string }>;
  providers: Array<{ id: string; business_name: string; owner_name: string | null; owner_email: string | null; status: string }>;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const _router = useRouter();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetcher.get<{ data: SearchResult }>(
          `/api/admin/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setSearchResults(response.data);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
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
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <Menu className="w-5 h-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-white">
                  <SidebarContent
                    pathname={pathname}
                    onNavigate={() => setSidebarOpen(false)}
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
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length >= 2) {
                    setShowResults(true);
                  }
                }}
                onFocus={() => {
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
          <SidebarContent pathname={pathname} />
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
                    placeholder="Search users, bookings, providers..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) {
                        setShowResults(true);
                      }
                    }}
                    onFocus={() => {
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
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
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
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
              <Icon className="w-5 h-5" />
              <span>{item.title}</span>
              {item.badge && (
                <Badge variant="secondary" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
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
        <button className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-lg">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="bg-pink-100 text-pink-600">
              {getInitials(user?.full_name || user?.email || null)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="w-4 h-4 text-gray-600 hidden lg:block" />
        </button>
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
