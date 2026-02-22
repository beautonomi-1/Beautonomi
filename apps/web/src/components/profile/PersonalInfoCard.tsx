"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  Check,
  Lock,
  Shield,
  X,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import type { ProfileUser } from "@/types/profile";

interface PersonalInfoCardProps {
  user: ProfileUser;
  onUpdate?: () => void;
}

interface EditModalProps {
  type: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
  user?: ProfileUser;
}

function EditModal({ type, isOpen, onClose, onSave, initialData, user }: EditModalProps) {
  const [formData, setFormData] = useState<any>(initialData || {});
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen && initialData) {
      setFormData(initialData);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {type === "legalName" && "Legal Name"}
            {type === "preferredName" && "Preferred Name"}
            {type === "email" && "Email Address"}
            {type === "phone" && "Phone Number"}
            {type === "address" && "Address"}
            {type === "emergencyContact" && "Emergency Contact"}
            {type === "identity" && "Government ID"}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === "legalName" && (
            <>
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name || ""}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name || ""}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          {type === "preferredName" && (
            <div>
              <Label htmlFor="preferred_name">Preferred Name</Label>
              <Input
                id="preferred_name"
                value={formData.preferred_name || ""}
                onChange={(e) => setFormData({ ...formData, preferred_name: e.target.value })}
                placeholder="How you'd like to be addressed"
              />
            </div>
          )}

          {type === "email" && (
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                You'll need to verify your new email address
              </p>
            </div>
          )}

          {type === "phone" && (
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+27 12 345 6789"
              />
            </div>
          )}

          {type === "address" && (
            <>
              <div>
                <Label htmlFor="line1">Street Address</Label>
                <Input
                  id="line1"
                  value={formData.line1 || ""}
                  onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="line2">Apt, Suite (optional)</Label>
                <Input
                  id="line2"
                  value={formData.line2 || ""}
                  onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    value={formData.state || ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code || ""}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country || ""}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {type === "emergencyContact" && (
            <>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="relationship">Relationship</Label>
                <Input
                  id="relationship"
                  value={formData.relationship || ""}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  placeholder="e.g., Spouse, Parent, Friend"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </>
          )}

          {type === "identity" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">
                Upload a government-issued ID for identity verification. This helps keep our community safe.
              </p>
              
              {/* Show existing document if available */}
              {user?.identity_verification_document_url && (
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-700 mb-2">Current document:</p>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-zinc-600" />
                    <span className="text-xs text-zinc-600 flex-1">
                      {user.identity_verification_document_type || "Document"} uploaded
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => window.open(user.identity_verification_document_url!, '_blank')}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    You can upload a new document to replace this one.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="document_type">Document Type</Label>
                <select
                  id="document_type"
                  value={formData.document_type || user?.identity_verification_document_type || ""}
                  onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
                  required
                >
                  <option value="">Select document type</option>
                  <option value="license">Driver's License</option>
                  <option value="passport">Passport</option>
                  <option value="identity">National ID</option>
                </select>
              </div>
              <div>
                <Label htmlFor="file">Upload Document</Label>
                <Input
                  id="file"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFormData({ ...formData, file });
                      // Show preview for images
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData(prev => ({ ...prev, file, preview: reader.result as string }));
                        };
                        reader.readAsDataURL(file);
                      } else {
                        setFormData(prev => ({ ...prev, file, preview: null }));
                      }
                    }
                  }}
                  required={!user?.identity_verification_document_url}
                />
                {formData.preview && (
                  <div className="mt-2">
                    <img 
                      src={formData.preview} 
                      alt="Preview" 
                      className="max-w-full h-48 object-contain border border-zinc-300 rounded-lg"
                    />
                  </div>
                )}
                {formData.file && !formData.preview && (
                  <p className="text-xs text-zinc-600 mt-2">
                    Selected: {formData.file.name} ({(formData.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  Accepted: JPEG, PNG, WebP, PDF (Max 10MB)
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#FF0077] hover:bg-[#E6006A] text-white"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function PersonalInfoCard({ user, onUpdate }: PersonalInfoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ type: string; isOpen: boolean; initialData?: any }>({
    type: "",
    isOpen: false,
    initialData: undefined,
  });

  const formatPhone = (phone: string | null) => {
    if (!phone) return "Not provided";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length >= 4) {
      return `${cleaned.substring(0, 3)} *** ***${cleaned.substring(cleaned.length - 4)}`;
    }
    return phone;
  };

  const formatEmail = (email: string) => {
    const parts = email.split("@");
    if (parts[0].length > 0) {
      return `${parts[0].substring(0, 1)}****@${parts[1] || ""}`;
    }
    return email;
  };

  const getVerificationStatus = () => {
    const status = user.identity_verification_status || "none";
    const hasSubmittedAt = !!user.identity_verification_submitted_at;
    
    // Only show "Under Review" if status is pending AND there's a submitted_at date
    // This means an actual verification was submitted
    if (status === "approved") {
      return { text: "Verified", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    }
    if (status === "pending" && hasSubmittedAt) {
      return { text: "Under Review", color: "text-amber-700 bg-amber-50 border-amber-200" };
    }
    if (status === "rejected") {
      return { text: "Rejected", color: "text-red-700 bg-red-50 border-red-200" };
    }
    // Default: Not verified (no submission or status is 'none')
    return { text: "Not verified", color: "text-zinc-600 bg-zinc-50 border-zinc-200" };
  };

  const verificationStatus = getVerificationStatus();

  const handleSave = async (type: string, data: any): Promise<void> => {
    try {
      if (type === "legalName") {
        await fetcher.patch("/api/me/profile", {
          first_name: data.first_name,
          last_name: data.last_name,
        });
        toast.success("Legal name updated");
      } else if (type === "preferredName") {
        await fetcher.patch("/api/me/profile", {
          preferred_name: data.preferred_name || null,
        });
        toast.success("Preferred name updated");
      } else if (type === "email") {
        await fetcher.patch("/api/me/profile", {
          email: data.email,
        });
        toast.success("Email updated. Please check your inbox to verify.");
      } else if (type === "phone") {
        await fetcher.patch("/api/me/profile", {
          phone: data.phone,
        });
        toast.success("Phone number updated");
      } else if (type === "address") {
        await fetcher.patch("/api/me/profile", {
          address: {
            line1: data.line1,
            line2: data.line2,
            city: data.city,
            state: data.state,
            postal_code: data.postal_code,
            country: data.country,
          },
        });
        toast.success("Address updated");
      } else if (type === "emergencyContact") {
        await fetcher.patch("/api/me/profile", {
          emergency_contact: {
            name: data.name,
            relationship: data.relationship,
            phone: data.phone,
            email: data.email,
          },
        });
        toast.success("Emergency contact updated");
      } else if (type === "identity") {
        const formData = new FormData();
        formData.append("file", data.file);
        formData.append("document_type", data.document_type);
        formData.append("country", data.country || user.address?.country || "South Africa");

        const response = await fetch("/api/me/verification", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Failed to upload ID");
        }

        toast.success("Government ID uploaded successfully! It will be reviewed by our team.");
      }

      onUpdate?.();
    } catch (error: any) {
      throw error;
    }
  };

  const openEditModal = (type: string) => {
    let initialData: any = {};
    
    if (type === "legalName") {
      initialData = { first_name: user.first_name || "", last_name: user.last_name || "" };
    } else if (type === "preferredName") {
      initialData = { preferred_name: user.preferred_name || "" };
    } else if (type === "email") {
      initialData = { email: user.email || "" };
    } else if (type === "phone") {
      initialData = { phone: user.phone || "" };
    } else if (type === "address") {
      initialData = {
        line1: user.address?.line1 || "",
        line2: user.address?.line2 || "",
        city: user.address?.city || "",
        state: user.address?.state || "",
        postal_code: user.address?.postal_code || "",
        country: user.address?.country || "",
      };
    } else if (type === "emergencyContact") {
      initialData = {
        name: user.emergency_contact?.name || "",
        relationship: user.emergency_contact?.relationship || "",
        phone: user.emergency_contact?.phone || "",
        email: user.emergency_contact?.email || "",
      };
    } else if (type === "identity") {
      initialData = {
        document_type: user.identity_verification_document_type || "",
        country: user.address?.country || "South Africa",
        file: null,
        preview: null,
      };
    }

    setEditModal({ type, isOpen: true, initialData });
  };

  return (
    <>
      <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-6 flex items-center justify-between hover:bg-white/40 transition-colors"
          aria-expanded={isOpen}
        >
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
            Personal Information
          </h3>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-zinc-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-500" />
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-4 border-t border-white/40">
                {/* Legal Name */}
                <InfoRow
                  label="Legal name"
                  value={`${user.first_name || ""} ${user.last_name || ""}`.trim() || "Not provided"}
                  onEdit={() => openEditModal("legalName")}
                />

                {/* Preferred Name */}
                <InfoRow
                  label="Preferred name"
                  value={user.preferred_name || "Not provided"}
                  onEdit={user.preferred_name ? () => openEditModal("preferredName") : undefined}
                  onAdd={!user.preferred_name ? () => openEditModal("preferredName") : undefined}
                />

                {/* Email */}
                <InfoRow
                  label="Email address"
                  value={formatEmail(user.email)}
                  verified={user.email_verified}
                  onEdit={() => openEditModal("email")}
                />

                {/* Phone */}
                <InfoRow
                  label="Phone number"
                  value={formatPhone(user.phone)}
                  verified={user.phone_verified}
                  onEdit={() => openEditModal("phone")}
                />

                {/* Government ID */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-900">Government ID</label>
                  </div>
                  <div className={`
                    p-4 rounded-xl border-2 ${verificationStatus.color}
                    flex items-start gap-3
                  `}>
                    <Shield className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium mb-1">{verificationStatus.text}</p>
                      {user.identity_verification_status === "pending" && user.identity_verification_submitted_at && (
                        <p className="text-xs opacity-70 mb-2">
                          Verification Pending / Under Review
                        </p>
                      )}
                      {user.identity_verification_status === "rejected" && user.identity_verification_rejection_reason && (
                        <p className="text-xs opacity-70 mb-2">
                          {user.identity_verification_rejection_reason}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {user.identity_verification_document_url && user.identity_verification_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-zinc-300 hover:bg-zinc-50"
                            onClick={async () => {
                              try {
                                const viewResponse = await fetcher.get<{ data?: { signed_url?: string } }>(`/api/me/verification/${user.identity_verification_id}/view`);
                                if (viewResponse.data?.signed_url) {
                                  window.open(viewResponse.data.signed_url, '_blank');
                                } else {
                                  toast.error("Failed to load document");
                                }
                              } catch (error: any) {
                                console.error("Error viewing document:", error);
                                if (error.message?.includes('Bucket not found') || error.message?.includes('not configured')) {
                                  toast.error("Storage not configured. Please contact support.");
                                } else {
                                  toast.error(error.message || "Failed to view document");
                                }
                              }
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View uploaded document
                          </Button>
                        )}
                        {(user.identity_verification_status === "none" || 
                          user.identity_verification_status === "rejected" ||
                          (user.identity_verification_status === "pending" && !user.identity_verification_document_url)) && (
                          <Button
                            size="sm"
                            className="bg-[#FF0077] hover:bg-[#E6006A] text-white"
                            onClick={() => openEditModal("identity")}
                          >
                            {user.identity_verification_status === "rejected" ? "Upload new document" : "Start verification"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <InfoRow
                  label="Address"
                  value={
                    user.address?.line1
                      ? `${user.address.line1}, ${user.address.city || ""}`
                      : "Not provided"
                  }
                  isOptional
                  onEdit={user.address ? () => openEditModal("address") : undefined}
                  onAdd={!user.address ? () => openEditModal("address") : undefined}
                />

                {/* Emergency Contact */}
                <InfoRow
                  label="Emergency contact"
                  value={user.emergency_contact?.name || "Not provided"}
                  isPrivate
                  onEdit={user.emergency_contact?.name ? () => openEditModal("emergencyContact") : undefined}
                  onAdd={!user.emergency_contact?.name ? () => openEditModal("emergencyContact") : undefined}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EditModal
        type={editModal.type}
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ type: "", isOpen: false, initialData: undefined })}
        onSave={(data) => handleSave(editModal.type, data)}
        initialData={editModal.initialData}
        user={user}
      />
    </>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  verified?: boolean;
  isPrivate?: boolean;
  isOptional?: boolean;
  onEdit?: () => void;
  onAdd?: () => void;
}

function InfoRow({
  label,
  value,
  verified,
  isPrivate,
  isOptional,
  onEdit,
  onAdd,
}: InfoRowProps) {
  return (
    <div className="py-3 border-b border-zinc-200/50 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-zinc-900">{label}</span>
            {verified && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Verified
              </span>
            )}
            {isPrivate && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Private
              </span>
            )}
            {isOptional && (
              <span className="text-xs text-zinc-400">Optional</span>
            )}
          </div>
          <p className="text-sm text-zinc-600">{value}</p>
        </div>
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="text-zinc-600 hover:text-[#FF0077]"
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
        {onAdd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdd}
            className="text-zinc-600 hover:text-[#FF0077]"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
