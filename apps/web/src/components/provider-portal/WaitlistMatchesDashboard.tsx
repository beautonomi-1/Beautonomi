"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import QuickBookingModal from "./QuickBookingModal";

interface WaitlistMatch {
  waitlist_entry_id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_name: string;
  preferred_date?: string;
  preferred_time_start?: string;
  preferred_time_end?: string;
  preferred_staff_id?: string;
  preferred_staff_name?: string;
  match_score: number;
  available_slots: Array<{
    date: string;
    time: string;
    staff_id: string;
    staff_name: string;
  }>;
}

interface WaitlistMatchesDashboardProps {
  providerId: string;
}

export default function WaitlistMatchesDashboard({ providerId }: WaitlistMatchesDashboardProps) {
  const [matches, setMatches] = useState<WaitlistMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [selectedMatch, setSelectedMatch] = useState<WaitlistMatch | null>(null);
  const [isQuickBookingOpen, setIsQuickBookingOpen] = useState(false);

  useEffect(() => {
    loadMatches();
  }, [providerId, selectedDate, selectedStaff]);

  const loadMatches = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append("date", selectedDate);
      if (selectedStaff !== "all") params.append("staff_id", selectedStaff);

      const response = await fetcher.get<{ matches: WaitlistMatch[] }>(
        `/api/provider/waitlist/matches?${params.toString()}`
      );
      setMatches(response.matches || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load waitlist matches");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickBook = (match: WaitlistMatch) => {
    setSelectedMatch(match);
    setIsQuickBookingOpen(true);
  };

  const handleBookingSuccess = () => {
    setIsQuickBookingOpen(false);
    setSelectedMatch(null);
    loadMatches();
    toast.success("Booking created successfully!");
  };

  const getScoreColor = (score: number) => {
    if (score >= 150) return "bg-green-100 text-green-700";
    if (score >= 100) return "bg-blue-100 text-blue-700";
    if (score >= 50) return "bg-amber-100 text-amber-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Waitlist Matches</h2>
          <p className="text-gray-600 mt-1">
            Find waitlist entries that match available slots
          </p>
        </div>
        <Button onClick={loadMatches} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
            min={format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Staff</label>
          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
            <SelectTrigger>
              <SelectValue placeholder="All staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {/* Staff options would be loaded from API */}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Matches List */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matches found</h3>
            <p className="text-gray-500">
              No waitlist entries match available slots for the selected criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {matches.map((match) => (
            <Card key={match.waitlist_entry_id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-lg">{match.client_name}</CardTitle>
                      <Badge className={getScoreColor(match.match_score)}>
                        Score: {match.match_score}
                      </Badge>
                    </div>
                    <CardDescription>{match.service_name}</CardDescription>
                  </div>
                  <Button
                    onClick={() => handleQuickBook(match)}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    Quick Book
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Preferences */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">Preferences</h4>
                    {match.preferred_date && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>{format(parseISO(match.preferred_date), "MMM d, yyyy")}</span>
                      </div>
                    )}
                    {match.preferred_time_start && match.preferred_time_end && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>
                          {match.preferred_time_start} - {match.preferred_time_end}
                        </span>
                      </div>
                    )}
                    {match.preferred_staff_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>{match.preferred_staff_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Available Slots */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Available Slots ({match.available_slots.length})
                    </h4>
                    {match.available_slots.length > 0 ? (
                      <div className="space-y-1">
                        {match.available_slots.slice(0, 3).map((slot, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded"
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span>
                              {format(parseISO(slot.date), "MMM d")} at {slot.time} with{" "}
                              {slot.staff_name}
                            </span>
                          </div>
                        ))}
                        {match.available_slots.length > 3 && (
                          <p className="text-xs text-gray-500">
                            +{match.available_slots.length - 3} more slots
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No available slots</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Booking Modal */}
      {selectedMatch && (
        <QuickBookingModal
          isOpen={isQuickBookingOpen}
          onClose={() => {
            setIsQuickBookingOpen(false);
            setSelectedMatch(null);
          }}
          waitlistEntryId={selectedMatch.waitlist_entry_id}
          clientName={selectedMatch.client_name}
          serviceName={selectedMatch.service_name}
          availableSlots={selectedMatch.available_slots}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
