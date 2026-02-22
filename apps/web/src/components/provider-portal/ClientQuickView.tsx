"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Star,
  AlertCircle,
  ChevronRight,
  MessageSquare,
  History
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface ClientInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  address?: string;
  notes?: string;
  total_visits?: number;
  total_spent?: number;
  last_visit?: string;
  membership_status?: "active" | "expired" | "none";
  loyalty_points?: number;
  outstanding_balance?: number;
  tags?: string[];
  preferred_services?: string[];
  allergies?: string;
  created_at?: string;
}

interface ClientQuickViewProps {
  client: ClientInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onViewFullProfile?: (clientId: string) => void;
  onSendMessage?: (clientId: string) => void;
  onBookAppointment?: (clientId: string) => void;
}

export function ClientQuickView({
  client,
  isOpen,
  onClose,
  onViewFullProfile,
  onSendMessage,
  onBookAppointment,
}: ClientQuickViewProps) {
  if (!client) return null;

  const initials = client.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-white">
        {/* Header with Avatar */}
        <div className="bg-gradient-to-br from-[#FF0077] to-[#FF6B35] p-6 text-white">
          <SheetHeader className="text-left">
            <div className="flex items-start gap-4">
              <Avatar className="w-16 h-16 border-2 border-white/30">
                <AvatarImage src={client.avatar_url} alt={client.name} />
                <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-white text-xl font-bold truncate">
                  {client.name}
                </SheetTitle>
                {client.membership_status && client.membership_status !== "none" && (
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "mt-1",
                      client.membership_status === "active" 
                        ? "bg-green-500/20 text-green-100" 
                        : "bg-red-500/20 text-red-100"
                    )}
                  >
                    {client.membership_status === "active" ? "Active Member" : "Expired Member"}
                  </Badge>
                )}
                {client.tags && client.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {client.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs border-white/30 text-white/80">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{client.total_visits || 0}</p>
              <p className="text-xs text-white/70">Visits</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-lg font-bold">{formatCurrency(client.total_spent || 0)}</p>
              <p className="text-xs text-white/70">Total Spent</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{client.loyalty_points || 0}</p>
              <p className="text-xs text-white/70">Points</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">
          {/* Outstanding Balance Warning */}
          {client.outstanding_balance && client.outstanding_balance > 0 && (
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">Outstanding Balance</p>
                <p className="text-lg font-bold text-red-600">
                  {formatCurrency(client.outstanding_balance)}
                </p>
              </div>
            </div>
          )}

          {/* Contact Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Contact Information
            </h3>
            
            {client.phone && (
              <a
                href={`tel:${client.phone}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="font-medium truncate">{client.phone}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </a>
            )}

            {client.email && (
              <a
                href={`mailto:${client.email}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium truncate">{client.email}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </a>
            )}

            {client.address && (
              <div className="flex items-center gap-3 p-3 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="font-medium">{client.address}</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Visit History */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Visit History
            </h3>
            
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[#FF0077]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Last Visit</p>
                <p className="font-medium">
                  {client.last_visit ? formatDate(client.last_visit) : "No visits yet"}
                </p>
              </div>
            </div>

            {client.created_at && (
              <div className="flex items-center gap-3 p-3 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Client Since</p>
                  <p className="font-medium">{formatDate(client.created_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Preferred Services */}
          {client.preferred_services && client.preferred_services.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Preferred Services
                </h3>
                <div className="flex flex-wrap gap-2">
                  {client.preferred_services.map((service) => (
                    <Badge key={service} variant="secondary" className="bg-[#FF0077]/10 text-[#FF0077]">
                      <Star className="w-3 h-3 mr-1" />
                      {service}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Allergies / Important Notes */}
          {client.allergies && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Allergies & Sensitivities
                </h3>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">{client.allergies}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          {client.notes && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Notes
                </h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {client.notes}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => onSendMessage?.(client.id)}
              className="flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </Button>
            <Button
              onClick={() => onBookAppointment?.(client.id)}
              className="flex items-center gap-2 bg-[#FF0077] hover:bg-[#D60565]"
            >
              <Calendar className="w-4 h-4" />
              Book
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => onViewFullProfile?.(client.id)}
            className="w-full flex items-center justify-center gap-2 text-gray-600"
          >
            <History className="w-4 h-4" />
            View Full Profile
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
