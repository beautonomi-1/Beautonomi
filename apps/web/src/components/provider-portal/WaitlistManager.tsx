"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Clock,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  MessageSquare,
  CalendarPlus,
  MoreVertical,
  AlertCircle,
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { Separator } from "@/components/ui/separator";
import { format, formatDistanceToNow, parseISO, isToday, isTomorrow } from "date-fns";
import { RADIX_SELECT_ANY } from "@/lib/ui/select-radix-sentinels";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

// Types
interface WaitlistEntry {
  id: string;
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_avatar?: string;
  service_id?: string;
  service_name: string;
  preferred_dates?: string[];
  preferred_times?: string[];
  preferred_team_member_id?: string;
  preferred_team_member_name?: string;
  notes?: string;
  status: "waiting" | "contacted" | "booked" | "cancelled" | "expired";
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  contacted_at?: string;
  booked_at?: string;
}

interface TeamMember {
  id: string;
  name: string;
  avatar_url?: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

// Status Badge Component
function WaitlistStatusBadge({ status }: { status: WaitlistEntry["status"] }) {
  const { t } = useTranslation();
  const config = {
    waiting: { label: t("web.provider.portal.waitlistManager.statusWaiting"), className: "bg-amber-100 text-amber-700" },
    contacted: { label: t("web.provider.portal.waitlistManager.statusContacted"), className: "bg-blue-100 text-blue-700" },
    booked: { label: t("web.provider.portal.waitlistManager.statusBooked"), className: "bg-green-100 text-green-700" },
    cancelled: { label: t("web.provider.portal.waitlistManager.statusCancelled"), className: "bg-gray-100 text-gray-700" },
    expired: { label: t("web.provider.portal.waitlistManager.statusExpired"), className: "bg-red-100 text-red-700" },
  };

  return (
    <Badge variant="outline" className={cn("border-0 font-medium", config[status].className)}>
      {config[status].label}
    </Badge>
  );
}

// Priority Badge Component
function PriorityBadge({ priority }: { priority: WaitlistEntry["priority"] }) {
  const { t } = useTranslation();
  const config = {
    low: { label: t("web.provider.portal.waitlistManager.priorityLow"), className: "bg-gray-100 text-gray-600" },
    normal: { label: t("web.provider.portal.waitlistManager.priorityNormal"), className: "bg-blue-100 text-blue-600" },
    high: { label: t("web.provider.portal.waitlistManager.priorityHigh"), className: "bg-orange-100 text-orange-600" },
    urgent: { label: t("web.provider.portal.waitlistManager.priorityUrgent"), className: "bg-red-100 text-red-600" },
  };

  return (
    <Badge variant="outline" className={cn("border-0 text-xs", config[priority].className)}>
      {config[priority].label}
    </Badge>
  );
}

// Waitlist Entry Card (Mobile)
interface WaitlistCardProps {
  entry: WaitlistEntry;
  onContact: (entry: WaitlistEntry) => void;
  onBook: (entry: WaitlistEntry) => void;
  onCancel: (entry: WaitlistEntry) => void;
  onViewDetails: (entry: WaitlistEntry) => void;
}

function WaitlistCard({
  entry,
  onContact,
  onBook,
  onCancel,
  onViewDetails,
}: WaitlistCardProps) {
  const { t } = useTranslation();
  const formatPreferredDates = () => {
    if (!entry.preferred_dates || entry.preferred_dates.length === 0) {
      return t("web.provider.portal.waitlistManager.anyDate");
    }
    return entry.preferred_dates.slice(0, 2).map((date) => {
      const d = parseISO(date);
      if (isToday(d)) return t("web.provider.portal.waitlistManager.today");
      if (isTomorrow(d)) return t("web.provider.portal.waitlistManager.tomorrow");
      return format(d, "MMM d");
    }).join(", ");
  };

  return (
    <div
      className={cn(
        "bg-white rounded-xl border p-4 transition-all",
        entry.priority === "urgent" && "border-s-4 border-s-red-500",
        entry.priority === "high" && "border-s-4 border-s-orange-500"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src={entry.client_avatar} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {entry.client_name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold text-gray-900">{entry.client_name}</h4>
              <p className="text-sm text-gray-500">{entry.service_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <WaitlistStatusBadge status={entry.status} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onViewDetails(entry)}>
                    <User className="w-4 h-4 me-2" />
                    {t("web.provider.portal.waitlistManager.viewDetails")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {entry.status === "waiting" && (
                    <>
                      <DropdownMenuItem onClick={() => onContact(entry)}>
                        <MessageSquare className="w-4 h-4 me-2" />
                        {t("web.provider.portal.waitlistManager.contactClient")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onBook(entry)}>
                        <CalendarPlus className="w-4 h-4 me-2" />
                        {t("web.provider.portal.waitlistManager.bookAppointment")}
                      </DropdownMenuItem>
                    </>
                  )}
                  {entry.status === "contacted" && (
                    <DropdownMenuItem onClick={() => onBook(entry)}>
                      <CalendarPlus className="w-4 h-4 me-2" />
                      {t("web.provider.portal.waitlistManager.bookAppointment")}
                    </DropdownMenuItem>
                  )}
                  {(entry.status === "waiting" || entry.status === "contacted") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onCancel(entry)}
                        className="text-red-600"
                      >
                        <XCircle className="w-4 h-4 me-2" />
                        {t("web.provider.portal.waitlistManager.removeFromWaitlist")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <PriorityBadge priority={entry.priority} />
            <span className="text-xs text-gray-400">
              {t("web.provider.portal.waitlistManager.addedAgo", { time: formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true }) })}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{formatPreferredDates()}</span>
            </div>
            {entry.preferred_team_member_name && (
              <div className="flex items-center gap-1">
                <User className="w-4 h-4 text-gray-400" />
                <span>{entry.preferred_team_member_name}</span>
              </div>
            )}
          </div>

          {(entry.status === "waiting" || entry.status === "contacted") && (
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onContact(entry)}
              >
                <MessageSquare className="w-4 h-4 me-1" />
                {t("web.provider.portal.waitlistManager.contact")}
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-primary hover:bg-primary-hover"
                onClick={() => onBook(entry)}
              >
                <CalendarPlus className="w-4 h-4 me-1" />
                {t("web.provider.portal.waitlistManager.book")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add to Waitlist Dialog
interface AddToWaitlistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  teamMembers: TeamMember[];
  onSubmit: (data: Partial<WaitlistEntry>) => Promise<void>;
}

export function AddToWaitlistDialog({
  isOpen,
  onClose,
  services,
  teamMembers,
  onSubmit,
}: AddToWaitlistDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    service_id: "",
    preferred_team_member_id: "",
    preferred_dates: [] as string[],
    notes: "",
    priority: "normal" as WaitlistEntry["priority"],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.service_id) return;
    if (formData.client_phone?.trim() && !isCompleteE164(formData.client_phone)) {
      toast.error(t("web.provider.portal.waitlistManager.invalidPhone"));
      return;
    }

    setIsSubmitting(true);
    try {
      const service = services.find((s) => s.id === formData.service_id);
      await onSubmit({
        ...formData,
        service_name: service?.name || "",
        preferred_team_member_name: teamMembers.find(
          (m) => m.id === formData.preferred_team_member_id
        )?.name,
        status: "waiting",
      });
      onClose();
      setFormData({
        client_name: "",
        client_email: "",
        client_phone: "",
        service_id: "",
        preferred_team_member_id: "",
        preferred_dates: [],
        notes: "",
        priority: "normal",
      });
    } catch (error) {
      console.error("Failed to add to waitlist:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] max-h-[90vh] rounded-t-3xl p-0 flex flex-col overflow-hidden font-sans bg-white"
      >
        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <SheetHeader className="px-6 sm:px-8 pb-4 border-b border-gray-100 relative">
          <button
            onClick={onClose}
            className="absolute right-6 top-0 p-2 -mt-2 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
            aria-label={t("web.provider.portal.waitlistManager.close")}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <SheetTitle className="text-xl font-bold text-gray-900 pe-10">
            {t("web.provider.portal.waitlistManager.addToWaitlist")}
          </SheetTitle>
        </SheetHeader>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 sm:py-8 space-y-6">
          {/* Client Info */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.clientNameRequired")}</Label>
            <Input
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              placeholder={t("web.provider.portal.waitlistManager.clientNamePlaceholder")}
              className="h-12 text-base"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.email")}</Label>
              <Input
                type="email"
                value={formData.client_email}
                onChange={(e) =>
                  setFormData({ ...formData, client_email: e.target.value })
                }
                placeholder={t("web.provider.portal.waitlistManager.emailPlaceholder")}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-3">
              <PhoneInput
                label={t("web.provider.portal.waitlistManager.phone")}
                inputId="waitlist-add-client-phone"
                value={formData.client_phone}
                onChange={(e164) => setFormData({ ...formData, client_phone: e164 })}
                className="space-y-1"
              />
            </div>
          </div>

          <Separator />

          {/* Service & Preferences */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.serviceRequired")}</Label>
            <Select
              value={formData.service_id}
              onValueChange={(value) =>
                setFormData({ ...formData, service_id: value })
              }
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder={t("web.provider.portal.waitlistManager.selectService")} />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id} className="h-12">
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.preferredStaff")}</Label>
            <Select
              value={formData.preferred_team_member_id || RADIX_SELECT_ANY}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  preferred_team_member_id: value === RADIX_SELECT_ANY ? "" : value,
                })
              }
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder={t("web.provider.portal.waitlistManager.anyAvailable")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RADIX_SELECT_ANY} className="h-12">{t("web.provider.portal.waitlistManager.anyAvailable")}</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id} className="h-12">
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.priority")}</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  priority: value as WaitlistEntry["priority"],
                })
              }
            >
              <SelectTrigger className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="h-12">{t("web.provider.portal.waitlistManager.priorityLow")}</SelectItem>
                <SelectItem value="normal" className="h-12">{t("web.provider.portal.waitlistManager.priorityNormal")}</SelectItem>
                <SelectItem value="high" className="h-12">{t("web.provider.portal.waitlistManager.priorityHigh")}</SelectItem>
                <SelectItem value="urgent" className="h-12">{t("web.provider.portal.waitlistManager.priorityUrgent")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">{t("web.provider.portal.waitlistManager.notes")}</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder={t("web.provider.portal.waitlistManager.notesPlaceholder")}
              className="min-h-[100px] text-base resize-none"
            />
          </div>
        </div>

        {/* Sticky Footer - Thumb Zone Optimized */}
        <div className="border-t border-gray-200 bg-white px-6 sm:px-8 py-5 space-y-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-14 text-base font-semibold"
            >
              {t("web.provider.portal.waitlistManager.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.client_name || !formData.service_id || isSubmitting}
              className="flex-1 h-14 text-base font-semibold bg-primary hover:bg-primary-hover text-white active:scale-95 transition-transform"
            >
              {isSubmitting ? t("web.provider.portal.waitlistManager.adding") : t("web.provider.portal.waitlistManager.addToWaitlist")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Main Waitlist Manager Component
interface WaitlistManagerProps {
  entries: WaitlistEntry[];
  services: Service[];
  teamMembers: TeamMember[];
  onAddEntry: (data: Partial<WaitlistEntry>) => Promise<void>;
  onUpdateEntry: (id: string, data: Partial<WaitlistEntry>) => Promise<void>;
  onContactClient: (entry: WaitlistEntry) => void;
  onBookAppointment: (entry: WaitlistEntry) => void;
}

export function WaitlistManager({
  entries,
  services,
  teamMembers,
  onAddEntry,
  onUpdateEntry,
  onContactClient,
  onBookAppointment,
}: WaitlistManagerProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sortBy, setSortBy] = useState<"date" | "priority">("priority");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [_selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);

  // Filter and sort entries
  const filteredEntries = entries
    .filter((entry) => {
      // Status filter
      if (statusFilter === "active") {
        return entry.status === "waiting" || entry.status === "contacted";
      }
      if (statusFilter !== "all") {
        return entry.status === statusFilter;
      }
      return true;
    })
    .filter((entry) => {
      // Search filter
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        entry.client_name.toLowerCase().includes(query) ||
        entry.service_name.toLowerCase().includes(query) ||
        entry.client_email?.toLowerCase().includes(query) ||
        entry.client_phone?.includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === "priority") {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleCancel = async (entry: WaitlistEntry) => {
    if (confirm(t("web.provider.portal.waitlistManager.removeConfirm", { name: entry.client_name }))) {
      await onUpdateEntry(entry.id, { status: "cancelled" });
    }
  };

  const waitingCount = entries.filter((e) => e.status === "waiting").length;
  const urgentCount = entries.filter(
    (e) => e.priority === "urgent" && (e.status === "waiting" || e.status === "contacted")
  ).length;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">{t("web.provider.portal.waitlistManager.statusWaiting")}</span>
          </div>
          <p className="text-2xl font-bold">{waitingCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-medium">{t("web.provider.portal.waitlistManager.priorityUrgent")}</span>
          </div>
          <p className="text-2xl font-bold">{urgentCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-medium">{t("web.provider.portal.waitlistManager.statusContacted")}</span>
          </div>
          <p className="text-2xl font-bold">
            {entries.filter((e) => e.status === "contacted").length}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">{t("web.provider.portal.waitlistManager.statusBooked")}</span>
          </div>
          <p className="text-2xl font-bold">
            {entries.filter((e) => e.status === "booked").length}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("web.provider.portal.waitlistManager.searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <Filter className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("web.provider.portal.waitlistManager.filterActive")}</SelectItem>
              <SelectItem value="waiting">{t("web.provider.portal.waitlistManager.statusWaiting")}</SelectItem>
              <SelectItem value="contacted">{t("web.provider.portal.waitlistManager.statusContacted")}</SelectItem>
              <SelectItem value="booked">{t("web.provider.portal.waitlistManager.statusBooked")}</SelectItem>
              <SelectItem value="all">{t("web.provider.portal.waitlistManager.filterAll")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "priority")}>
            <SelectTrigger className="w-32">
              <ArrowUpDown className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">{t("web.provider.portal.waitlistManager.priority")}</SelectItem>
              <SelectItem value="date">{t("web.provider.portal.waitlistManager.dateAdded")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-primary hover:bg-primary-hover"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.portal.waitlistManager.add")}
          </Button>
        </div>
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {t("web.provider.portal.waitlistManager.noEntries")}
          </h3>
          <p className="text-gray-500 mb-4">
            {searchQuery
              ? t("web.provider.portal.waitlistManager.noMatch")
              : t("web.provider.portal.waitlistManager.emptyHint")}
          </p>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-primary hover:bg-primary-hover"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.portal.waitlistManager.addToWaitlist")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <WaitlistCard
              key={entry.id}
              entry={entry}
              onContact={onContactClient}
              onBook={onBookAppointment}
              onCancel={handleCancel}
              onViewDetails={setSelectedEntry}
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <AddToWaitlistDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        services={services}
        teamMembers={teamMembers}
        onSubmit={onAddEntry}
      />
    </div>
  );
}
