"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Eye,
  EyeOff,
  Flag,
  Star,
  XCircle,
  MessageSquare,
  Download,
  MoreVertical,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  is_verified: boolean;
  is_flagged: boolean;
  flagged_reason: string | null;
  is_visible: boolean;
  helpful_count: number;
  created_at: string;
  customer: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  provider: {
    id: string;
    business_name: string;
    logo_url: string | null;
  };
  booking: {
    id: string;
    booking_number: string;
    status: string;
  };
}

interface ReviewStatistics {
  total: number;
  visible: number;
  hidden: number;
  flagged: number;
  average_rating: string;
  rating_distribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statistics, setStatistics] = useState<ReviewStatistics | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showModerateDialog, setShowModerateDialog] = useState(false);
  const [moderateAction, setModerateAction] = useState<"hide" | "flag" | "edit">("hide");
  const [moderateReason, setModerateReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [moderateComment, setModerateComment] = useState("");

  useEffect(() => {
    loadReviews();
  }, [statusFilter, ratingFilter, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (ratingFilter !== "all") params.set("rating", ratingFilter);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetcher.get<{
        data: {
          reviews: Review[];
          statistics: ReviewStatistics;
          pagination: any;
        };
      }>(`/api/admin/reviews?${params.toString()}`);

      setReviews(response.data.reviews);
      setStatistics(response.data.statistics);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load reviews";
      setError(errorMessage);
      console.error("Error loading reviews:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModerate = async () => {
    if (!selectedReview) return;

    try {
      const updateData: any = {};

      if (moderateAction === "hide") {
        updateData.is_visible = false;
      } else if (moderateAction === "flag") {
        updateData.is_flagged = true;
        updateData.flagged_reason = moderateReason;
      } else if (moderateAction === "edit") {
        updateData.comment = moderateComment;
      }

      await fetcher.patch(`/api/admin/reviews/${selectedReview.id}`, updateData);

      toast.success("Review updated successfully");
      setShowModerateDialog(false);
      setSelectedReview(null);
      setModerateReason("");
      setModerateComment("");
      loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update review");
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to delete this review? This action cannot be undone.")) {
      return;
    }

    try {
      await fetcher.delete(`/api/admin/reviews/${reviewId}`);
      toast.success("Review deleted successfully");
      loadReviews();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to delete review");
    }
  };

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch =
      review.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.customer?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.provider?.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.booking?.booking_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.comment?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedReviews = {
    all: filteredReviews,
    visible: filteredReviews.filter((r) => r.is_visible),
    hidden: filteredReviews.filter((r) => !r.is_visible),
    flagged: filteredReviews.filter((r) => r.is_flagged),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading reviews..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <EmptyState
            title="Failed to load reviews"
            description={error}
            action={{
              label: "Retry",
              onClick: loadReviews,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
              >
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900">Reviews Management</h1>
                <p className="text-sm md:text-base font-light text-gray-600 mt-1">Moderate and manage all platform reviews</p>
              </motion.div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const params = new URLSearchParams();
                    if (statusFilter !== "all") params.set("status", statusFilter);
                    if (ratingFilter !== "all") params.set("rating", ratingFilter);
                    if (startDate) params.set("start_date", startDate);
                    if (endDate) params.set("end_date", endDate);
                    
                    const response = await fetch(`/api/admin/export/reviews?${params.toString()}`);
                    if (!response.ok) throw new Error("Export failed");
                    
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `reviews-export-${new Date().toISOString().split("T")[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    toast.success("Export downloaded");
                  } catch {
                    toast.error("Failed to export reviews");
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Statistics */}
            {statistics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">Total Reviews</div>
                  <div className="text-2xl font-semibold tracking-tight text-gray-900">{statistics.total}</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">Visible</div>
                  <div className="text-2xl font-semibold tracking-tight text-green-600">{statistics.visible}</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">Hidden</div>
                  <div className="text-2xl font-semibold tracking-tight text-gray-600">{statistics.hidden}</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">Flagged</div>
                  <div className="text-2xl font-semibold tracking-tight text-red-600">{statistics.flagged}</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">Avg Rating</div>
                  <div className="text-2xl font-semibold tracking-tight text-yellow-600">{statistics.average_rating}</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg"
                >
                  <div className="text-sm font-light text-gray-600">5 Stars</div>
                  <div className="text-2xl font-semibold tracking-tight text-yellow-600">
                    {statistics.rating_distribution[5]}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Filters */}
            <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 mb-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        type="text"
                        placeholder="Search by customer, provider, booking number, or comment..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 backdrop-blur-sm bg-white/60 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                      />
                    </div>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-white/40 rounded-xl backdrop-blur-sm bg-white/60 focus:border-[#FF0077] focus:ring-[#FF0077]"
                  >
                    <option value="all">All Status</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                    <option value="flagged">Flagged</option>
                  </select>
                  <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value)}
                    className="px-4 py-2 border border-white/40 rounded-xl backdrop-blur-sm bg-white/60 focus:border-[#FF0077] focus:ring-[#FF0077]"
                  >
                    <option value="all">All Ratings</option>
                    <option value="5">5 Stars</option>
                    <option value="4">4 Stars</option>
                    <option value="3">3 Stars</option>
                    <option value="2">2 Stars</option>
                    <option value="1">1 Star</option>
                  </select>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <Input
                    type="date"
                    placeholder="Start Date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="backdrop-blur-sm bg-white/60 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                  <Input
                    type="date"
                    placeholder="End Date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="backdrop-blur-sm bg-white/60 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Reviews List */}
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-1 shadow-lg">
                <TabsTrigger value="all" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">All ({groupedReviews.all.length})</TabsTrigger>
                <TabsTrigger value="visible" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">Visible ({groupedReviews.visible.length})</TabsTrigger>
                <TabsTrigger value="hidden" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">Hidden ({groupedReviews.hidden.length})</TabsTrigger>
                <TabsTrigger value="flagged" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">Flagged ({groupedReviews.flagged.length})</TabsTrigger>
              </TabsList>

          <TabsContent value="all" className="space-y-4">
            <ReviewList
              reviews={groupedReviews.all}
              onModerate={(review, action) => {
                setSelectedReview(review);
                setModerateAction(action);
                setModerateComment(review.comment || "");
                setShowModerateDialog(true);
              }}
              onDelete={handleDelete}
            />
          </TabsContent>
          <TabsContent value="visible" className="space-y-4">
            <ReviewList
              reviews={groupedReviews.visible}
              onModerate={(review, action) => {
                setSelectedReview(review);
                setModerateAction(action);
                setModerateComment(review.comment || "");
                setShowModerateDialog(true);
              }}
              onDelete={handleDelete}
            />
          </TabsContent>
          <TabsContent value="hidden" className="space-y-4">
            <ReviewList
              reviews={groupedReviews.hidden}
              onModerate={(review, action) => {
                setSelectedReview(review);
                setModerateAction(action);
                setModerateComment(review.comment || "");
                setShowModerateDialog(true);
              }}
              onDelete={handleDelete}
            />
          </TabsContent>
          <TabsContent value="flagged" className="space-y-4">
            <ReviewList
              reviews={groupedReviews.flagged}
              onModerate={(review, action) => {
                setSelectedReview(review);
                setModerateAction(action);
                setModerateComment(review.comment || "");
                setShowModerateDialog(true);
              }}
              onDelete={handleDelete}
            />
            </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>

      {/* Moderate Dialog */}
      <Dialog open={showModerateDialog} onOpenChange={setShowModerateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {moderateAction === "hide"
                  ? "Hide Review"
                  : moderateAction === "flag"
                  ? "Flag Review"
                  : "Edit Review"}
              </DialogTitle>
              <DialogDescription>
                {moderateAction === "hide"
                  ? "This review will be hidden from public view."
                  : moderateAction === "flag"
                  ? "Flag this review for further review. Please provide a reason."
                  : "Edit the review comment."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {moderateAction === "flag" && (
                <div>
                  <Label>Reason for Flagging</Label>
                  <Textarea
                    value={moderateReason}
                    onChange={(e) => setModerateReason(e.target.value)}
                    placeholder="Enter reason for flagging this review..."
                    rows={3}
                  />
                </div>
              )}
              {moderateAction === "edit" && (
                <div>
                  <Label>Review Comment</Label>
                  <Textarea
                    value={moderateComment}
                    onChange={(e) => setModerateComment(e.target.value)}
                    placeholder="Edit review comment..."
                    rows={5}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowModerateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleModerate}>Confirm</Button>
              </div>
            </div>
          </DialogContent>
      </Dialog>
    </RoleGuard>
  );
}

function ReviewList({
  reviews,
  onModerate,
  onDelete,
}: {
  reviews: Review[];
  onModerate: (review: Review, action: "hide" | "flag" | "edit") => void;
  onDelete: (reviewId: string) => void;
}) {
  if (reviews.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg border border-gray-200 text-center">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No reviews found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <div key={review.id} className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <Badge variant={review.is_visible ? "default" : "secondary"}>
                  {review.is_visible ? "Visible" : "Hidden"}
                </Badge>
                {review.is_flagged && (
                  <Badge variant="destructive">Flagged</Badge>
                )}
                {review.is_verified && (
                  <Badge variant="outline">Verified</Badge>
                )}
              </div>
              <p className="text-gray-900 mb-3">{review.comment || "No comment"}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>
                  <strong>Customer:</strong> {review.customer?.full_name || review.customer?.email}
                </span>
                <span>
                  <strong>Provider:</strong> {review.provider?.business_name}
                </span>
                <span>
                  <strong>Booking:</strong> {review.booking?.booking_number}
                </span>
                <span>
                  <strong>Date:</strong> {new Date(review.created_at).toLocaleDateString()}
                </span>
                {review.helpful_count > 0 && (
                  <span>
                    <strong>Helpful:</strong> {review.helpful_count}
                  </span>
                )}
              </div>
              {review.flagged_reason && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                  <strong>Flagged Reason:</strong> {review.flagged_reason}
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {review.is_visible ? (
                  <DropdownMenuItem onClick={() => onModerate(review, "hide")}>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Hide
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={async () => {
                      await fetcher.patch(`/api/admin/reviews/${review.id}`, { is_visible: true });
                      window.location.reload();
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Show
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onModerate(review, "flag")}>
                  <Flag className="w-4 h-4 mr-2" />
                  Flag
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModerate(review, "edit")}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(review.id)}
                  className="text-red-600"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
