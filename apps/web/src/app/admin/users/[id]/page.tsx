"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  DollarSign,
  ArrowLeft,
  Edit,
  Ban,
  CheckCircle,
  XCircle,
  Trash2,
  Pencil,
  MapPin,
  CreditCard,
  Wallet,
  TicketIcon,
  ShoppingBag,
  Copy,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompliancePurgeUserDialog } from "@/components/admin/CompliancePurgeUserDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

interface UserAddress {
  id: string;
  label?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
}

interface PaymentMethod {
  id: string;
  type?: string;
  provider?: string;
  last_four?: string;
  expiry_month?: number;
  expiry_year?: number;
  card_brand?: string;
  is_default?: boolean;
  is_active?: boolean;
  created_at?: string;
}

interface SupportTicket {
  id: string;
  ticket_number?: string;
  subject?: string;
  status?: string;
  priority?: string;
  created_at?: string;
}

interface ProductOrder {
  id: string;
  order_number?: string;
  status?: string;
  payment_status?: string;
  total_amount?: number;
  currency?: string;
  fulfillment_type?: string;
  created_at?: string;
  provider?: { id?: string; business_name?: string } | null;
}

interface UserDetail {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  push_notifications_enabled?: boolean;
  stats?: {
    total_bookings: number;
    total_spent: number;
    last_booking_date: string | null;
    product_orders_count?: number;
    product_orders_paid_total?: number;
    provider_count?: number;
  };
  addresses?: UserAddress[];
  payment_methods?: PaymentMethod[];
  wallet?: { balance: number; currency: string; updated_at?: string } | null;
  support_tickets?: SupportTicket[];
  recent_product_orders?: ProductOrder[];
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { format: fmtMoney } = useReportCurrency();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  useEffect(() => {
    if (userId) loadUser();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUser = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: UserDetail }>(`/api/admin/users/${userId}`);
      setUser(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load user";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    try {
      await fetcher.patch(`/api/admin/users/${userId}`, {
        deactivated_at: new Date().toISOString(),
        deactivation_reason: "Deactivated by admin",
      });
      toast.success("User deactivated successfully");
      loadUser();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate user");
    }
  };

  const handleReactivate = async () => {
    try {
      await fetcher.patch(`/api/admin/users/${userId}`, {
        deactivated_at: null,
        deactivation_reason: null,
      });
      toast.success("User reactivated successfully");
      loadUser();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate user");
    }
  };

  const openEditProfile = () => {
    if (!user) return;
    setEditName(user.full_name ?? "");
    setEditPhone(user.phone ?? "");
    setEditEmail(user.email ?? "");
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error("Name is required"); return; }
    setEditSaving(true);
    try {
      await fetcher.patch(`/api/admin/users/${userId}`, {
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
      });
      toast.success("Profile updated");
      setEditProfileOpen(false);
      loadUser();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile");
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm("Send a password reset link to this user's email?")) return;
    setResetPasswordLoading(true);
    try {
      const res = await fetcher.post<{ data: { recovery_link?: string; message?: string } }>(
        `/api/admin/users/${userId}/reset-password`,
        {},
      );
      const link = res.data?.recovery_link;
      if (link) {
        await navigator.clipboard.writeText(link);
        toast.success("Password reset link copied to clipboard");
      } else {
        toast.success("Password reset email sent");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset password");
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading user details..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !user) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load user"
            description={error || "Unable to load user details"}
            action={{ label: "Back to Users", onClick: () => router.push("/admin/users") }}
          />
        </div>
      </RoleGuard>
    );
  }

  const isDeactivated = !!user.deactivated_at;

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push("/admin/users")}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">{user.full_name || "User"}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-gray-600 text-sm">{user.email}</p>
                    <button onClick={() => copyToClipboard(user.email)} className="text-gray-400 hover:text-gray-600">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{user.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={isDeactivated ? "destructive" : "default"} className="text-sm">
                  {isDeactivated ? "Deactivated" : "Active"}
                </Badge>
                <Badge variant="secondary" className="text-sm">{user.role}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline"><Edit className="w-4 h-4 mr-2" />Actions</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={openEditProfile}>
                      <Pencil className="w-4 h-4 mr-2" />Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleResetPassword} disabled={resetPasswordLoading}>
                      <KeyRound className="w-4 h-4 mr-2" />{resetPasswordLoading ? "Generating..." : "Reset Password"}
                    </DropdownMenuItem>
                    {isDeactivated ? (
                      <DropdownMenuItem onClick={handleReactivate}>
                        <CheckCircle className="w-4 h-4 mr-2" />Reactivate User
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={handleDeactivate}>
                        <Ban className="w-4 h-4 mr-2" />Deactivate User
                      </DropdownMenuItem>
                    )}
                    {user.role !== "superadmin" && (
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setPurgeOpen(true)}>
                        <Trash2 className="w-4 h-4 mr-2" />Purge account &amp; data…
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={<Calendar className="w-4 h-4" />} label="Member since" value={format(new Date(user.created_at), "PP")} />
              <StatCard icon={<Calendar className="w-4 h-4" />} label="Total Bookings" value={String(user.stats?.total_bookings ?? 0)} />
              <StatCard icon={<DollarSign className="w-4 h-4" />} label="Total Spent" value={fmtMoney(user.stats?.total_spent ?? 0)} />
              <StatCard icon={<ShoppingBag className="w-4 h-4" />} label="Product Orders" value={String(user.stats?.product_orders_count ?? 0)} />
              <StatCard icon={<Wallet className="w-4 h-4" />} label="Wallet Balance" value={user.wallet ? fmtMoney(user.wallet.balance) : "N/A"} />
              <StatCard icon={<TicketIcon className="w-4 h-4" />} label="Support Tickets" value={String(user.support_tickets?.length ?? 0)} />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="backdrop-blur-xl bg-white/80 border rounded-xl p-1">
                <TabsTrigger value="info">Profile</TabsTrigger>
                <TabsTrigger value="addresses">Addresses ({user.addresses?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="payments">Payment Methods ({user.payment_methods?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="bookings">Bookings</TabsTrigger>
                <TabsTrigger value="orders">Orders ({user.recent_product_orders?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="tickets">Tickets ({user.support_tickets?.length ?? 0})</TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="info">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle>User Information</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <InfoRow icon={<User className="w-5 h-5 text-gray-400" />} label="Full Name" value={user.full_name || "Not provided"} />
                      <InfoRow icon={<Mail className="w-5 h-5 text-gray-400" />} label="Email" value={user.email} />
                      <InfoRow icon={<Phone className="w-5 h-5 text-gray-400" />} label="Phone" value={user.phone || "Not provided"} />
                      <InfoRow icon={<Shield className="w-5 h-5 text-gray-400" />} label="Role" value={user.role} />
                      <InfoRow icon={<Calendar className="w-5 h-5 text-gray-400" />} label="Joined" value={format(new Date(user.created_at), "PPP")} />
                      {isDeactivated && user.deactivated_at && (
                        <InfoRow icon={<XCircle className="w-5 h-5 text-red-400" />} label="Deactivated" value={`${format(new Date(user.deactivated_at), "PP")} — ${user.deactivation_reason || "No reason"}`} />
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Email notifications</span>
                        <Badge variant={user.email_notifications_enabled !== false ? "default" : "secondary"}>
                          {user.email_notifications_enabled !== false ? "On" : "Off"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">SMS notifications</span>
                        <Badge variant={user.sms_notifications_enabled !== false ? "default" : "secondary"}>
                          {user.sms_notifications_enabled !== false ? "On" : "Off"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Push notifications</span>
                        <Badge variant={user.push_notifications_enabled !== false ? "default" : "secondary"}>
                          {user.push_notifications_enabled !== false ? "On" : "Off"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {user.wallet && (
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" />Wallet</CardTitle></CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">{fmtMoney(user.wallet.balance)}</p>
                        <p className="text-xs text-gray-500 mt-1">Currency: {user.wallet.currency}</p>
                        {user.wallet.updated_at && (
                          <p className="text-xs text-gray-400 mt-1">Last updated: {format(new Date(user.wallet.updated_at), "PPp")}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {user.stats?.provider_count != null && user.stats.provider_count > 0 && (
                    <Card>
                      <CardHeader><CardTitle>Provider Owner</CardTitle></CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600">This user owns <strong>{user.stats.provider_count}</strong> provider(s).</p>
                        <Link href={`/admin/providers?owner_id=${userId}`} className="text-sm text-[#FF0077] hover:underline mt-2 inline-block">
                          View their providers →
                        </Link>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* Addresses Tab */}
              <TabsContent value="addresses">
                {!user.addresses?.length ? (
                  <EmptyState title="No addresses" description="This user has no saved addresses." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {user.addresses.map((addr) => (
                      <Card key={addr.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-sm">{addr.label || "Address"}</p>
                                {addr.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                              </div>
                              <p className="text-sm text-gray-600">
                                {[addr.address_line1, addr.address_line2, addr.city, addr.province, addr.postal_code, addr.country].filter(Boolean).join(", ")}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Payment Methods Tab */}
              <TabsContent value="payments">
                {!user.payment_methods?.length ? (
                  <EmptyState title="No payment methods" description="This user has no saved payment methods." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {user.payment_methods.map((pm) => (
                      <Card key={pm.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <CreditCard className="w-5 h-5 text-gray-400 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-sm">{pm.card_brand || pm.provider || pm.type || "Card"}</p>
                                {pm.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                                <Badge variant={pm.is_active ? "default" : "destructive"} className="text-[10px]">{pm.is_active ? "Active" : "Inactive"}</Badge>
                              </div>
                              {pm.last_four && <p className="text-sm text-gray-600">•••• {pm.last_four}</p>}
                              {pm.expiry_month && pm.expiry_year && (
                                <p className="text-xs text-gray-400">Exp: {pm.expiry_month}/{pm.expiry_year}</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Bookings Tab */}
              <TabsContent value="bookings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total bookings: {user.stats?.total_bookings ?? 0}</p>
                    <Link href={`/admin/bookings?customer_id=${userId}`}>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-3 h-3 mr-2" />View All Bookings
                      </Button>
                    </Link>
                  </div>
                  {user.stats?.last_booking_date && (
                    <p className="text-sm text-gray-500">Last booking: {format(new Date(user.stats.last_booking_date), "PPp")}</p>
                  )}
                </div>
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders">
                {!user.recent_product_orders?.length ? (
                  <EmptyState title="No product orders" description="This user has not placed any product orders." />
                ) : (
                  <div className="space-y-3">
                    {user.recent_product_orders.map((order) => (
                      <Card key={order.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="font-medium text-sm">#{order.order_number}</p>
                              <p className="text-xs text-gray-500">
                                {order.provider && typeof order.provider === "object" && "business_name" in order.provider
                                  ? (order.provider as { business_name?: string }).business_name
                                  : "—"}{" "}
                                · {order.fulfillment_type ?? "—"} · {order.created_at ? format(new Date(order.created_at), "PP") : "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={order.status === "delivered" || order.status === "completed" ? "default" : "secondary"} className="text-xs">{order.status}</Badge>
                              <Badge variant={order.payment_status === "paid" ? "default" : "secondary"} className="text-xs">{order.payment_status}</Badge>
                              <span className="font-semibold text-sm">{fmtMoney(order.total_amount ?? 0)}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Support Tickets Tab */}
              <TabsContent value="tickets">
                {!user.support_tickets?.length ? (
                  <EmptyState title="No support tickets" description="This user has not opened any support tickets." />
                ) : (
                  <div className="space-y-3">
                    {user.support_tickets.map((ticket) => (
                      <Link key={ticket.id} href={`/admin/support/${ticket.id}`}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <p className="font-medium text-sm">{ticket.subject || "No subject"}</p>
                                <p className="text-xs text-gray-500">#{ticket.ticket_number} · {ticket.created_at ? format(new Date(ticket.created_at), "PP") : "—"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={ticket.status === "resolved" || ticket.status === "closed" ? "default" : "secondary"} className="text-xs">{ticket.status}</Badge>
                                {ticket.priority && <Badge variant={ticket.priority === "urgent" || ticket.priority === "high" ? "destructive" : "secondary"} className="text-xs">{ticket.priority}</Badge>}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>

        {/* Edit Profile Dialog */}
        <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User Profile</DialogTitle>
              <DialogDescription>Update the user&apos;s name, phone, or other details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+27..." />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={editEmail} disabled className="bg-gray-50" />
                <p className="text-xs text-gray-400 mt-1">Email changes require the user to verify via link. Use password reset instead.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditProfileOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CompliancePurgeUserDialog
          open={purgeOpen}
          onOpenChange={setPurgeOpen}
          userId={userId}
          userEmail={user.email}
          onComplete={() => router.push("/admin/users")}
        />
      </div>
    </RoleGuard>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="backdrop-blur-xl bg-white/80 border rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 mb-1">{icon}<span className="text-xs">{label}</span></div>
      <p className="font-semibold text-sm text-gray-900 truncate">{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
