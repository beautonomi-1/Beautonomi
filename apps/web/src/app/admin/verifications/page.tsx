"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  User,
  Mail,
  Phone,
  FileText,
  Globe,
  Calendar,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Verification {
  id: string;
  user_id: string;
  document_type: string;
  country: string;
  document_url: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  user: {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export default function AdminVerifications() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">("approved");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    loadVerifications();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps -- load when tab changes

  const loadVerifications = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const status = activeTab === "all" ? "all" : activeTab;
      const response = await fetcher.get<{ data: Verification[] }>(
        `/api/admin/verifications?status=${status}`
      );
      setVerifications(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load verifications";
      setError(errorMessage);
      console.error("Error loading verifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selectedVerification) return;

    setIsReviewing(true);
    try {
      await fetcher.patch(`/api/admin/verifications/${selectedVerification.id}`, {
        status: reviewStatus,
        rejection_reason: reviewStatus === "rejected" ? rejectionReason : null,
      });

      toast.success(`Verification ${reviewStatus === "approved" ? "approved" : "rejected"}`);
      setShowReviewDialog(false);
      setSelectedVerification(null);
      setRejectionReason("");
      loadVerifications();
    } catch {
      toast.error("Failed to review verification");
    } finally {
      setIsReviewing(false);
    }
  };

   
  const _getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  if (isLoading && verifications.length === 0) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="min-h-screen bg-zinc-50/50">
          <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            <LoadingTimeout loadingMessage="Loading verifications..." />
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            <div className="mb-4 sm:mb-6">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="text-2xl sm:text-3xl font-semibold tracking-tighter mb-1 sm:mb-2 text-gray-900"
              >
                Identity Verifications
              </motion.h1>
              <p className="text-sm sm:text-base font-light text-gray-600">
                Review and manage user identity verifications
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="mb-4 sm:mb-6 grid w-full grid-cols-4 h-auto backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-1 shadow-lg">
                <TabsTrigger
                  value="pending"
                  className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all"
                >
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Pending</span>
                  <span className="sm:hidden">Pending</span>
                </TabsTrigger>
                <TabsTrigger
                  value="approved"
                  className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all"
                >
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Approved</span>
                  <span className="sm:hidden">Approved</span>
                </TabsTrigger>
                <TabsTrigger
                  value="rejected"
                  className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all"
                >
                  <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Rejected</span>
                  <span className="sm:hidden">Rejected</span>
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all"
                >
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">All</span>
                  <span className="sm:hidden">All</span>
                </TabsTrigger>
              </TabsList>

          <TabsContent value="pending" className="mt-0">
            {error ? (
              <EmptyState
                title="Failed to load verifications"
                description={error}
                action={{ label: "Retry", onClick: loadVerifications }}
              />
            ) : verifications.length === 0 ? (
              <EmptyState
                title="No pending verifications"
                description="There are no pending verifications at this time."
              />
            ) : (
              <VerificationList
                verifications={verifications}
                onReview={(v) => {
                  setSelectedVerification(v);
                  setShowReviewDialog(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="approved" className="mt-0">
            {error ? (
              <EmptyState
                title="Failed to load verifications"
                description={error}
                action={{ label: "Retry", onClick: loadVerifications }}
              />
            ) : verifications.length === 0 ? (
              <EmptyState
                title="No approved verifications"
                description="There are no approved verifications at this time."
              />
            ) : (
              <VerificationList
                verifications={verifications}
                onReview={(v) => {
                  setSelectedVerification(v);
                  setShowReviewDialog(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="rejected" className="mt-0">
            {error ? (
              <EmptyState
                title="Failed to load verifications"
                description={error}
                action={{ label: "Retry", onClick: loadVerifications }}
              />
            ) : verifications.length === 0 ? (
              <EmptyState
                title="No rejected verifications"
                description="There are no rejected verifications at this time."
              />
            ) : (
              <VerificationList
                verifications={verifications}
                onReview={(v) => {
                  setSelectedVerification(v);
                  setShowReviewDialog(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-0">
            {error ? (
              <EmptyState
                title="Failed to load verifications"
                description={error}
                action={{ label: "Retry", onClick: loadVerifications }}
              />
            ) : verifications.length === 0 ? (
              <EmptyState
                title="No verifications"
                description="There are no verifications at this time."
              />
            ) : (
              <VerificationList
                verifications={verifications}
                onReview={(v) => {
                  setSelectedVerification(v);
                  setShowReviewDialog(true);
                }}
              />
            )}
          </TabsContent>
            </Tabs>
          </motion.div>

          {/* Review Dialog */}
          <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl">Review Verification</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                Review the verification document and approve or reject it.
              </DialogDescription>
            </DialogHeader>

            {selectedVerification && (
              <div className="space-y-4 sm:space-y-6">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 sm:p-6">
                  <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                    User Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Name</p>
                        <p className="text-sm sm:text-base font-medium">
                          {selectedVerification.user.full_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Email</p>
                        <p className="text-sm sm:text-base font-medium break-all">
                          {selectedVerification.user.email}
                        </p>
                      </div>
                    </div>
                    {selectedVerification.user.phone && (
                      <div className="flex items-start gap-2 sm:gap-3">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs sm:text-sm text-gray-500">Phone</p>
                          <p className="text-sm sm:text-base font-medium">
                            {selectedVerification.user.phone}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 sm:gap-3">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Document Type</p>
                        <p className="text-sm sm:text-base font-medium capitalize">
                          {selectedVerification.document_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Country</p>
                        <p className="text-sm sm:text-base font-medium">
                          {selectedVerification.country}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 sm:gap-3">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-gray-500">Submitted</p>
                        <p className="text-sm sm:text-base font-medium">
                          {new Date(selectedVerification.submitted_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                    Verification Document
                  </h3>
                  <div className="border-2 border-gray-200 rounded-lg p-3 sm:p-4 bg-white">
                    <DocumentViewer verificationId={selectedVerification.id} documentUrl={selectedVerification.document_url} />
                  </div>
                </div>

                <div className="border-t pt-4 sm:pt-6">
                  <Label className="text-sm sm:text-base font-semibold mb-3 sm:mb-4 block">
                    Review Decision
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button
                      variant={reviewStatus === "approved" ? "default" : "outline"}
                      onClick={() => setReviewStatus("approved")}
                      className={`flex-1 sm:flex-none ${
                        reviewStatus === "approved"
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : ""
                      }`}
                    >
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant={reviewStatus === "rejected" ? "destructive" : "outline"}
                      onClick={() => setReviewStatus("rejected")}
                      className="flex-1 sm:flex-none"
                    >
                      <XCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                {reviewStatus === "rejected" && (
                  <div>
                    <Label htmlFor="rejection-reason" className="text-sm sm:text-base font-semibold">
                      Rejection Reason <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Please provide a reason for rejection..."
                      rows={4}
                      className="mt-2 text-sm sm:text-base"
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowReviewDialog(false);
                      setSelectedVerification(null);
                      setRejectionReason("");
                    }}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReview}
                    disabled={isReviewing || (reviewStatus === "rejected" && !rejectionReason.trim())}
                    className={`w-full sm:w-auto ${
                      reviewStatus === "approved"
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {isReviewing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {reviewStatus === "approved" ? (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        {reviewStatus === "approved" ? "Approve" : "Reject"} Verification
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
          </Dialog>
        </div>
      </div>
    </RoleGuard>
  );
}

// Document Viewer Component
function DocumentViewer({ verificationId, documentUrl }: { verificationId: string; documentUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: { signed_url: string } }>(`/api/admin/verifications/${verificationId}/view`);
        if (response.data?.signed_url) {
          setSignedUrl(response.data.signed_url);
        } else {
          setError("Failed to load document");
        }
      } catch (err: any) {
        console.error("Error loading document:", err);
        if (err.message?.includes('Bucket not found') || err.message?.includes('not configured')) {
          setError("Storage bucket not configured. Please create 'verification-documents' bucket in Supabase Dashboard.");
        } else {
          setError(err.message || "Failed to load document");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [verificationId]);

  if (isLoading) {
    return (
      <div className="text-center p-6 sm:p-8">
        <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-4 animate-spin" />
        <p className="text-sm sm:text-base text-gray-600">Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6 sm:p-8">
        <XCircle className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-red-400 mb-4" />
        <p className="text-sm sm:text-base text-red-600 mb-2">{error}</p>
        <p className="text-xs text-gray-500">
          To fix: Go to Supabase Dashboard → Storage → New Bucket → Name: &quot;verification-documents&quot; → Public: false
        </p>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="text-center p-6 sm:p-8">
        <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-4" />
        <p className="text-sm sm:text-base text-gray-600">Document not available</p>
      </div>
    );
  }

  return documentUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
    <div className="relative w-full">
      <Image
        src={signedUrl}
        alt="Verification document"
        width={800}
        height={600}
        className="max-w-full h-auto rounded-lg shadow-sm"
        unoptimized
      />
    </div>
  ) : (
    <div className="text-center p-6 sm:p-8">
      <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-4" />
      <p className="text-sm sm:text-base text-gray-600 mb-4">PDF Document</p>
      <a
        href={signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm sm:text-base text-[#FF0077] hover:text-[#FF0077]/80 font-medium underline"
      >
        <Eye className="w-4 h-4" />
        View PDF Document
      </a>
    </div>
  );
}

// Verification List Component
function VerificationList({
  verifications,
  onReview,
}: {
  verifications: Verification[];
  onReview: (v: Verification) => void;
}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="backdrop-blur-sm bg-white/60 border-b border-white/40">
              <tr>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="backdrop-blur-sm bg-white/40 divide-y divide-white/40">
              {verifications.map((verification) => (
                <motion.tr
                  key={verification.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.6)" }}
                  className="transition-colors"
                >
                  <td className="px-4 lg:px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {verification.user.full_name}
                      </div>
                      <div className="text-sm text-gray-500">{verification.user.email}</div>
                    </div>
                  </td>
                  <td className="px-4 lg:px-6 py-4">
                    <div className="text-sm text-gray-900 capitalize">
                      {verification.document_type}
                    </div>
                    <div className="text-sm text-gray-500">{verification.country}</div>
                  </td>
                  <td className="px-4 lg:px-6 py-4">{getStatusBadge(verification.status)}</td>
                  <td className="px-4 lg:px-6 py-4 text-sm text-gray-500">
                    {new Date(verification.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 lg:px-6 py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReview(verification)}
                      className="text-xs sm:text-sm"
                    >
                      <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      Review
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {verifications.map((verification) => (
          <motion.div
            key={verification.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm sm:text-base truncate">
                    {verification.user.full_name}
                  </h3>
                  {getStatusBadge(verification.status)}
                </div>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{verification.user.email}</span>
                  </div>
                  {verification.user.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span>{verification.user.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Document:
                </span>
                <span className="font-medium capitalize">{verification.document_type}</span>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Country:
                </span>
                <span className="font-medium">{verification.country}</span>
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Submitted:
                </span>
                <span className="font-medium">
                  {new Date(verification.submitted_at).toLocaleDateString()}
                </span>
              </div>
              {verification.rejection_reason && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <strong>Reason:</strong> {verification.rejection_reason}
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-white/40">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReview(verification)}
                  className="w-full text-xs sm:text-sm border-white/40 backdrop-blur-sm bg-white/60 hover:bg-white/80"
                >
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Review Verification
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
