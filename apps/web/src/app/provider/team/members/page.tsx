"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { TeamMember } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneDisplay } from "@/components/ui/phone-display";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { MoreVertical, Plus, Mail, Phone, User, Clock, Settings, Archive, KeyRound, Eye, GripVertical, Info } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamMemberCreateEditDialog } from "./components/TeamMemberCreateEditDialog";
import { toast } from "sonner";
import { FetchError } from "@/lib/http/fetcher";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

// Cache key includes location so switching locations always fetches fresh data
const teamMembersCacheKey = (locationId?: string | null) =>
  locationId ? `provider_team_members:${locationId}` : 'provider_team_members';
const TEAM_MEMBERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
type TeamAccessPayload = {
  can_manage_team: boolean;
};

export default function ProviderTeamMembers() {
  const { provider, isLoading: isLoadingProvider, selectedLocationId } = useProviderPortal();
  const isFreelancer = provider?.business_type === "freelancer";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [teamAccessLoaded, setTeamAccessLoaded] = useState(false);

  // Restore from location-scoped cache on mount / when location changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(teamMembersCacheKey(selectedLocationId));
        if (cached) {
          const parsed = JSON.parse(cached);
          const cacheAge = Date.now() - (parsed.timestamp || 0);
          if (cacheAge < TEAM_MEMBERS_CACHE_DURATION && parsed.data?.length > 0) {
            setMembers(parsed.data);
            setIsLoading(false);
          }
        }
      } catch {
        // Ignore cache errors
      }
    }
  }, [selectedLocationId]);

  useEffect(() => {
    if (!isLoadingProvider && provider) {
      loadMembers();
    }
  }, [isLoadingProvider, provider, selectedLocationId]);

  useEffect(() => {
    let mounted = true;
    const loadAccess = async () => {
      try {
        const { fetcher } = await import("@/lib/http/fetcher");
        const res = await fetcher.get<{ data?: TeamAccessPayload }>("/api/provider/team-access");
        if (!mounted) return;
        const payload = (res as any)?.data ?? res;
        setCanManageTeam(payload?.can_manage_team === true);
      } catch {
        if (!mounted) return;
        setCanManageTeam(false);
      } finally {
        if (mounted) setTeamAccessLoaded(true);
      }
    };
    void loadAccess();
    return () => {
      mounted = false;
    };
  }, []);

  const loadMembers = async () => {
    try {
      if (members.length === 0) {
        setIsLoading(true);
      }
      const data = await providerApi.listTeamMembers(selectedLocationId || undefined);
      setMembers(data);
      // Cache the response scoped to current location
      if (typeof window !== 'undefined' && data.length > 0) {
        try {
          sessionStorage.setItem(teamMembersCacheKey(selectedLocationId), JSON.stringify({
            data,
            timestamp: Date.now()
          }));
        } catch {
          // Ignore storage errors
        }
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
      // Only show error if we don't have any data to display
      if (members.length === 0) {
        toast.error("Failed to load team members");
      }
      // Don't clear existing members on error - keep showing cached data
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = members.filter((member) =>
    (member?.name ?? "").toLowerCase().includes((searchQuery ?? "").toLowerCase()) ||
    (member?.email ?? "").toLowerCase().includes((searchQuery ?? "").toLowerCase())
  );

  const handleCreate = () => {
    if (!canManageTeam) return;
    setSelectedMember(null);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (member: TeamMember) => {
    if (!canManageTeam) return;
    setSelectedMember(member);
    setIsCreateDialogOpen(true);
  };

  const handleSave = async (wasUpdate: boolean) => {
    setIsCreateDialogOpen(false);
    setSelectedMember(null);
    // Force refresh immediately and again after a delay to ensure API has processed
    await loadMembers();
    setTimeout(() => {
      loadMembers();
    }, 500);
    toast.success(wasUpdate ? "Team member updated" : "Team member created");
  };

  const handleDelete = async (member: TeamMember, reassignTo?: string) => {
    if (!canManageTeam) return;
    if (
      !reassignTo &&
      !confirm(`Are you sure you want to delete ${member.name}? This action cannot be undone.`)
    ) {
      return;
    }
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const qs = reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : "";
      await fetcher.delete(`/api/provider/staff/${member.id}${qs}`);
      toast.success(`${member.name} has been deleted`);
      loadMembers();
    } catch (error) {
      const fetchErr = error as FetchError;
      if (fetchErr?.status === 409 || fetchErr?.code === "FUTURE_BOOKINGS_CONFLICT") {
        const proceed = confirm(
          `${member.name} has upcoming bookings. Reassign those bookings to any available staff and delete?`,
        );
        if (proceed) {
          await handleDelete(member, "any");
          return;
        }
      }
      console.error("Failed to delete member:", error);
      toast.error(fetchErr?.message || "Failed to delete member");
    }
  };

  const handleRevokeInvite = async (member: TeamMember) => {
    if (!canManageTeam) return;
    if (!confirm(`Revoke the pending invite for ${member.name}?`)) return;
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/staff/${member.id}/invite/revoke`, {});
      toast.success(`Invite revoked for ${member.name}`);
      loadMembers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke invite");
    }
  };

  const handleResetPassword = async (member: TeamMember) => {
    if (!canManageTeam) return;
    if (!confirm(`Send password reset email to ${member.name}?`)) return;
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/staff/${member.id}/reset-password`, {});
      toast.success(`Password reset email sent to ${member.email}`);
    } catch (error: any) {
      console.error("Failed to send password reset:", error);
      toast.error(error?.message || "Failed to send password reset email");
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    if (!canManageTeam) return;
    if (!member.email) {
      toast.error("This team member has no email address");
      return;
    }
    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const res = await fetcher.post<{
        data?: { join_url?: string; channels?: { email?: boolean; push?: boolean } };
      }>(`/api/provider/staff/${member.id}/invite`, {
        email: member.email,
      });
      const joinUrl = res.data?.join_url;
      if (joinUrl && !res.data?.channels?.email) {
        toast.success("Invite link ready — copy and share if email did not send", {
          description: joinUrl,
          duration: 8000,
        });
      } else {
        toast.success(`Invitation sent to ${member.email}`);
      }
    } catch (error: any) {
      console.error("Failed to send invitation:", error);
      const joinUrl = error?.details?.join_url;
      if (joinUrl) {
        toast.error(error?.message || "Email not configured", {
          description: `Share this link: ${joinUrl}`,
          duration: 10000,
        });
      } else {
        toast.error(error?.message || "Failed to send invitation");
      }
    }
  };

  // Show loading while provider is loading
  if (isLoadingProvider) {
    return <LoadingTimeout loadingMessage="Loading provider data..." />;
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 box-border">
      <PageHeader
        title="Team Members"
        subtitle={isFreelancer ? "Your profile and service settings" : "Manage your team members and their settings"}
        primaryAction={
          !isFreelancer && canManageTeam
            ? {
                label: "Add Staff Member",
                onClick: handleCreate,
                icon: <Plus className="w-4 h-4 mr-2" />,
              }
            : undefined
        }
      />
      {members.some((m) => {
        const until = m.over_cap_grace_until;
        return !!until && Number.isFinite(new Date(until).getTime()) && new Date(until).getTime() > Date.now();
      }) ? (
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="w-4 h-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            Your plan is over the staff cap. Some team members were deactivated and stay in a grace window
            until {members
              .map((m) => m.over_cap_grace_until)
              .filter((v): v is string => !!v)
              .map((v) => new Date(v).getTime())
              .filter((t) => t > Date.now())
              .sort((a, b) => a - b)[0]
              ? new Date(
                  Math.min(
                    ...members
                      .map((m) => m.over_cap_grace_until)
                      .filter((v): v is string => !!v)
                      .map((v) => new Date(v).getTime())
                      .filter((t) => t > Date.now()),
                  ),
                ).toLocaleDateString()
              : "the grace period ends"}
            . Upgrade or keep the roster at the new limit to reactivate them.
          </AlertDescription>
        </Alert>
      ) : null}
      {teamAccessLoaded && !canManageTeam ? (
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="w-4 h-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            You have read-only team access. Ask an owner or manager with Manage team to add or edit members.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Freelancer Info Banner */}
      {isFreelancer && (
        <Alert className="mb-4 sm:mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary-hover/5">
          <Info className="w-4 h-4 text-primary" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-primary">You're set up as a freelancer.</span>{" "}
                You are automatically added as a staff member for calendar bookings. To add team members and unlock advanced features,{" "}
                <Link href="/provider/settings/upgrade-to-salon" className="text-primary hover:underline font-medium">
                  upgrade to a salon
                </Link>
                .
              </p>
            </div>
            <Link href="/provider/settings/upgrade-to-salon">
              <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] touch-manipulation">
                Upgrade to Salon
              </button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards - Mobile First */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 w-full max-w-full box-border">
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Total</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {members.length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Active</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {members.filter(m => m.is_active).length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">Service Providers</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {members.filter(m => m.role === "employee" || m.role === "manager").length}
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm text-gray-600">On Shift</div>
              <div className="text-base sm:text-lg font-semibold truncate">
                {members.filter(m => m.is_active).length}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Search and Filters - Mobile First */}
      <div className="mb-4 sm:mb-6 w-full max-w-full box-border">
        <div className="relative w-full max-w-full">
          <input
            type="text"
            placeholder="Search team members by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-full pl-10 pr-4 py-2.5 sm:py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/35 min-h-[44px] touch-manipulation box-border provider-input"
          />
          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 flex-shrink-0" />
        </div>
      </div>

      {/* Team Members List - Mobile First */}
      {isLoading ? (
        <SectionCard>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </SectionCard>
      ) : filteredMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12">
          <EmptyState
            title={selectedLocationId ? "No staff at this location" : "No team members"}
            description={
              selectedLocationId
                ? "No one is assigned to this branch yet. Assign existing team members to this location, or add someone new."
                : "Add your first team member to get started. They'll be able to manage appointments, services, and more."
            }
            action={
              canManageTeam
                ? {
                    label: "Add Staff Member",
                    onClick: handleCreate,
                  }
                : undefined
            }
          />
        </SectionCard>
      ) : (
        <>
          {/* Desktop Table View */}
          <SectionCard className="p-0 overflow-hidden hidden lg:block box-border max-w-full">
            <div className="provider-table-scroll overflow-x-auto w-full max-w-full box-border">
              <Table className="w-full max-w-full">
                <TableHeader>
                  <TableRow className="border-b border-gray-200 hover:bg-transparent">
                    <TableHead className="w-12 px-4 py-3">
                      <GripVertical className="w-4 h-4 text-gray-400" />
                    </TableHead>
                    <TableHead className="px-4 py-3">Name</TableHead>
                    <TableHead className="px-4 py-3">Email</TableHead>
                    <TableHead className="px-4 py-3">Mobile</TableHead>
                    <TableHead className="px-4 py-3">Role</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3">Rating</TableHead>
                    <TableHead className="text-right px-4 py-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => (
                    <TableRow key={member.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <TableCell className="px-6 py-4">
                        <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.avatar_url} alt={member.name} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {member.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-gray-900">{member.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700">{member.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <PhoneDisplay phone={member.mobile} />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge variant="outline" className="capitalize border-gray-300">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge className={member.is_active ? "bg-green-100 text-green-800 border-green-200" : "bg-gray-100 text-gray-800 border-gray-200"}>
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {member.rating ? (
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-gray-900">{member.rating.toFixed(1)}</span>
                            <span className="text-yellow-500">★</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right px-6 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              disabled={!canManageTeam}
                            >
                              <MoreVertical className="w-4 h-4 text-gray-600" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleEdit(member)} className="cursor-pointer">
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(member)} className="cursor-pointer">
                              <Settings className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResendInvite(member)} className="cursor-pointer">
                              <Mail className="w-4 h-4 mr-2" />
                              Resend invite
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleRevokeInvite(member)} className="cursor-pointer">
                              <Mail className="w-4 h-4 mr-2" />
                              Revoke invite
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(member)} className="cursor-pointer">
                              <KeyRound className="w-4 h-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(member)} 
                              className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3 sm:space-y-4">
            {filteredMembers.map((member) => (
              <SectionCard key={member.id} className="p-4 sm:p-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="flex-shrink-0">
                        <AvatarImage src={member.avatar_url} alt={member.name} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {member.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-base sm:text-lg truncate">
                          {member.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="capitalize text-xs">
                            {member.role}
                          </Badge>
                          <Badge className={member.is_active ? "bg-green-100 text-green-800 text-xs" : "bg-gray-100 text-gray-800 text-xs"}>
                            {member.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-2 hover:bg-gray-100 rounded min-h-[44px] min-w-[44px] touch-manipulation flex-shrink-0"
                          disabled={!canManageTeam}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(member)}>
                          <User className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(member)}>
                          <Settings className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResendInvite(member)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Resend invite
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleRevokeInvite(member)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Revoke invite
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResetPassword(member)}>
                          <KeyRound className="w-4 h-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(member)} className="text-red-600">
                          <Archive className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-sm border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <PhoneDisplay phone={member.mobile} showIcon={false} className="text-gray-600" />
                    </div>
                    {member.rating && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Rating:</span>
                        <span className="flex items-center gap-1 font-medium">
                          {member.rating.toFixed(1)}
                          <span className="text-yellow-500">★</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(member)}
                      disabled={!canManageTeam}
                      className="flex-1 min-h-[44px] touch-manipulation"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Manage
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvite(member)}
                      disabled={!canManageTeam}
                      className="flex-1 min-h-[44px] touch-manipulation"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Resend invite
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetPassword(member)}
                      disabled={!canManageTeam}
                      className="flex-1 min-h-[44px] touch-manipulation"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      Reset Password
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        </>
      )}

      <TeamMemberCreateEditDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        member={selectedMember}
        onSave={handleSave}
      />
    </div>
  );
}
