"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
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
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import type { ProfileUser } from "@/types/profile";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { isMailableEmail } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

interface PersonalInfoCardProps {
  user: ProfileUser;
  onUpdate?: () => void;
  /** From ?focus= on /account-settings — opens the matching edit modal */
  completionFocus?: string | null;
  /** After the modal is opened (or focus is invalid), strip ?focus= from the URL */
  onCompletionFocusConsumed?: () => void;
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
  const { t } = useTranslation();
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
    if (type === "phone" && formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error(t("web.accountSettings.personalInfo.invalidPhone"));
      return;
    }
    if (type === "emergencyContact" && formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error(t("web.accountSettings.personalInfo.invalidEmergencyPhone"));
      return;
    }
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      toast.error(error.message || t("web.accountSettings.personalInfo.failedToSave"));
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
            {type === "legalName" && t("web.accountSettings.personalInfo.legalName")}
            {type === "preferredName" && t("web.accountSettings.personalInfo.preferredName")}
            {type === "email" && t("web.accountSettings.personalInfo.emailAddress")}
            {type === "phone" && t("web.accountSettings.personalInfo.phoneNumber")}
            {type === "address" && t("web.accountSettings.personalInfo.address")}
            {type === "emergencyContact" && t("web.accountSettings.personalInfo.emergencyContact")}
            {type === "identity" && t("web.accountSettings.personalInfo.governmentId")}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700"
            aria-label={t("web.accountSettings.personalInfo.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === "legalName" && (
            <>
              <div>
                <Label htmlFor="first_name">{t("web.accountSettings.personalInfo.firstName")}</Label>
                <Input
                  id="first_name"
                  value={formData.first_name || ""}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">{t("web.accountSettings.personalInfo.lastName")}</Label>
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
              <Label htmlFor="preferred_name">{t("web.accountSettings.personalInfo.preferredName")}</Label>
              <Input
                id="preferred_name"
                value={formData.preferred_name || ""}
                onChange={(e) => setFormData({ ...formData, preferred_name: e.target.value })}
                placeholder={t("web.accountSettings.personalInfo.preferredNamePlaceholder")}
              />
            </div>
          )}

          {type === "email" && (
            <div>
              <Label htmlFor="email">{t("web.accountSettings.personalInfo.emailAddress")}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                {t("web.accountSettings.personalInfo.emailChangeHint")}
              </p>
            </div>
          )}

          {type === "phone" && (
            <div>
              <PhoneInput
                inputId="profile-edit-phone"
                label={t("web.accountSettings.personalInfo.phoneNumber")}
                value={formData.phone || ""}
                onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                placeholder={t("web.accountSettings.personalInfo.phonePlaceholder")}
              />
            </div>
          )}

          {type === "address" && (
            <>
              <div>
                <Label htmlFor="line1">{t("web.accountSettings.personalInfo.streetAddress")}</Label>
                <Input
                  id="line1"
                  value={formData.line1 || ""}
                  onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="line2">{t("web.accountSettings.personalInfo.aptOptional")}</Label>
                <Input
                  id="line2"
                  value={formData.line2 || ""}
                  onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">{t("web.accountSettings.personalInfo.city")}</Label>
                  <Input
                    id="city"
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">{t("web.accountSettings.personalInfo.stateProvince")}</Label>
                  <Input
                    id="state"
                    value={formData.state || ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postal_code">{t("web.accountSettings.personalInfo.postalCode")}</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code || ""}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="country">{t("web.accountSettings.personalInfo.country")}</Label>
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
                <Label htmlFor="name">{t("web.accountSettings.personalInfo.name")}</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="relationship">{t("web.accountSettings.personalInfo.relationship")}</Label>
                <Input
                  id="relationship"
                  value={formData.relationship || ""}
                  onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                  placeholder={t("web.accountSettings.personalInfo.relationshipPlaceholder")}
                />
              </div>
              <div>
                <PhoneInput
                  inputId="profile-edit-emergency-phone"
                  label={t("web.accountSettings.personalInfo.phoneNumber")}
                  value={formData.phone || ""}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                  placeholder={t("web.accountSettings.personalInfo.phonePlaceholder")}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">{t("web.accountSettings.personalInfo.emailOptional")}</Label>
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
                {t("web.accountSettings.personalInfo.identityUploadHint")}
              </p>
              
              {/* Show existing document if available */}
              {user?.identity_verification_document_url && (
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-700 mb-2">{t("web.accountSettings.personalInfo.currentDocument")}</p>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-zinc-600" />
                    <span className="text-xs text-zinc-600 flex-1">
                      {t("web.accountSettings.personalInfo.documentUploaded", { type: user.identity_verification_document_type || t("web.accountSettings.personalInfo.document") })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => window.open(user.identity_verification_document_url!, '_blank')}
                    >
                      <Eye className="h-3 w-3 me-1" />
                      {t("web.accountSettings.personalInfo.view")}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {t("web.accountSettings.personalInfo.replaceDocumentHint")}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="document_type">{t("web.accountSettings.personalInfo.documentType")}</Label>
                <select
                  id="document_type"
                  value={formData.document_type || user?.identity_verification_document_type || ""}
                  onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
                  required
                >
                  <option value="">{t("web.accountSettings.personalInfo.selectDocumentType")}</option>
                  <option value="license">{t("web.accountSettings.personalInfo.driversLicense")}</option>
                  <option value="passport">{t("web.accountSettings.personalInfo.passport")}</option>
                  <option value="identity">{t("web.accountSettings.personalInfo.nationalId")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="file">{t("web.accountSettings.personalInfo.uploadDocument")}</Label>
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
                  <div className="mt-2 relative w-full h-48">
                    <Image
                      src={formData.preview}
                      alt={t("web.accountSettings.personalInfo.preview")}
                      fill
                      className="object-contain border border-zinc-300 rounded-lg"
                      unoptimized
                    />
                  </div>
                )}
                {formData.file && !formData.preview && (
                  <p className="text-xs text-zinc-600 mt-2">
                    {t("web.accountSettings.personalInfo.selectedFile", { name: formData.file.name, size: (formData.file.size / 1024 / 1024).toFixed(2) })}
                  </p>
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  {t("web.accountSettings.personalInfo.acceptedFormats")}
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
              {t("web.accountSettings.personalInfo.cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#FF0077] hover:bg-[#E6006A] text-white"
              disabled={isSaving}
            >
              {isSaving ? t("web.accountSettings.personalInfo.saving") : t("web.accountSettings.personalInfo.save")}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function PersonalInfoCard({
  user,
  onUpdate,
  completionFocus,
  onCompletionFocusConsumed,
}: PersonalInfoCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ type: string; isOpen: boolean; initialData?: any }>({
    type: "",
    isOpen: false,
    initialData: undefined,
  });

  const formatPhone = (phone: string | null) => {
    if (!phone) return t("web.accountSettings.personalInfo.notProvided");
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length >= 4) {
      return `${cleaned.substring(0, 3)} *** ***${cleaned.substring(cleaned.length - 4)}`;
    }
    return phone;
  };

  const formatEmail = (email: string) => {
    if (!email || !isMailableEmail(email)) return t("web.accountSettings.personalInfo.notProvided");
    const parts = email.split("@");
    if (parts[0].length > 0) {
      return `${parts[0].substring(0, 1)}****@${parts[1] || ""}`;
    }
    return email;
  };

  const getVerificationStatus = () => {
    if (user.identity_verified) {
      return { text: t("web.accountSettings.personalInfo.verified"), color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    }
    const status = user.identity_verification_status || "none";
    const hasSubmittedAt = !!user.identity_verification_submitted_at;
    
    // Only show "Under Review" if status is pending AND there's a submitted_at date
    // This means an actual verification was submitted
    if (status === "approved") {
      return { text: t("web.accountSettings.personalInfo.verified"), color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    }
    if (status === "pending" && hasSubmittedAt) {
      return { text: t("web.accountSettings.personalInfo.underReview"), color: "text-amber-700 bg-amber-50 border-amber-200" };
    }
    if (status === "rejected") {
      return { text: t("web.accountSettings.personalInfo.rejected"), color: "text-red-700 bg-red-50 border-red-200" };
    }
    // Default: Not verified (no submission or status is 'none')
    return { text: t("web.accountSettings.personalInfo.notVerified"), color: "text-zinc-600 bg-zinc-50 border-zinc-200" };
  };

  const verificationStatus = getVerificationStatus();

  const handleSave = async (type: string, data: any): Promise<void> => {
    try {
      if (type === "legalName") {
        await fetcher.patch("/api/me/profile", {
          first_name: data.first_name,
          last_name: data.last_name,
        });
        toast.success(t("web.accountSettings.personalInfo.legalNameUpdated"));
      } else if (type === "preferredName") {
        await fetcher.patch("/api/me/profile", {
          preferred_name: data.preferred_name || null,
        });
        toast.success(t("web.accountSettings.personalInfo.preferredNameUpdated"));
      } else if (type === "email") {
        await fetcher.patch("/api/me/profile", {
          email: data.email,
        });
        toast.success(t("web.accountSettings.personalInfo.emailUpdatedCheckInbox"));
      } else if (type === "phone") {
        await fetcher.patch("/api/me/profile", {
          phone: data.phone,
        });
        toast.success(t("web.accountSettings.personalInfo.phoneNumberUpdated"));
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
        toast.success(t("web.accountSettings.personalInfo.addressUpdated"));
      } else if (type === "emergencyContact") {
        await fetcher.patch("/api/me/profile", {
          emergency_contact: {
            name: data.name,
            relationship: data.relationship,
            phone: data.phone,
            email: data.email,
          },
        });
        toast.success(t("web.accountSettings.personalInfo.emergencyContactUpdated"));
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
          throw new Error(error.error?.message || t("web.accountSettings.personalInfo.uploadIdFailed"));
        }

        toast.success(t("web.accountSettings.personalInfo.idUploaded"));
      }

      onUpdate?.();
    } catch (error: any) {
      throw error;
    }
  };

  const openEditModal = useCallback(
    (type: string) => {
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
    },
    [user]
  );

  const lastAppliedFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!completionFocus) {
      lastAppliedFocus.current = null;
      return;
    }
    if (lastAppliedFocus.current === completionFocus) return;

    const allowed = [
      "legalName",
      "preferredName",
      "email",
      "phone",
      "address",
      "emergencyContact",
      "identity",
    ];
    if (!allowed.includes(completionFocus)) {
      onCompletionFocusConsumed?.();
      return;
    }

    lastAppliedFocus.current = completionFocus;
    setIsOpen(true);
    const t = window.setTimeout(() => {
      openEditModal(completionFocus);
      onCompletionFocusConsumed?.();
    }, 120);
    return () => window.clearTimeout(t);
  }, [completionFocus, openEditModal, onCompletionFocusConsumed]);

  return (
    <>
      <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-6 flex items-center justify-between hover:bg-zinc-50/80 transition-colors"
          aria-expanded={isOpen}
        >
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
            {t("web.accountSettings.personalInfo.personalInformation")}
          </h3>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-zinc-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-500" />
          )}
        </button>

        {isOpen ? (
          <div className="px-6 pb-6 space-y-4 border-t border-zinc-100">
                {/* Legal Name */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.legalName")}
                  value={`${user.first_name || ""} ${user.last_name || ""}`.trim() || t("web.accountSettings.personalInfo.notProvided")}
                  onEdit={() => openEditModal("legalName")}
                />

                {/* Preferred Name */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.preferredName")}
                  value={user.preferred_name || t("web.accountSettings.personalInfo.notProvided")}
                  onEdit={user.preferred_name ? () => openEditModal("preferredName") : undefined}
                  onAdd={!user.preferred_name ? () => openEditModal("preferredName") : undefined}
                />

                {/* Email */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.emailAddress")}
                  value={formatEmail(user.email)}
                  verified={!isMailableEmail(user.email) || user.email_verified}
                  onEdit={() => openEditModal("email")}
                />

                {/* Phone */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.phoneNumber")}
                  value={formatPhone(user.phone)}
                  verified={user.phone_verified}
                  onEdit={() => openEditModal("phone")}
                />

                {/* Government ID */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-900">{t("web.accountSettings.personalInfo.governmentId")}</label>
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
                          {t("web.accountSettings.personalInfo.verificationPendingReview")}
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
                                  toast.error(t("web.accountSettings.personalInfo.failedLoadDocument"));
                                }
                              } catch (error: any) {
                                console.error("Error viewing document:", error);
                                if (error.message?.includes('Bucket not found') || error.message?.includes('not configured')) {
                                  toast.error(t("web.accountSettings.personalInfo.storageNotConfigured"));
                                } else {
                                  toast.error(error.message || t("web.accountSettings.personalInfo.failedViewDocument"));
                                }
                              }
                            }}
                          >
                            <Eye className="h-4 w-4 me-1" />
                            {t("web.accountSettings.personalInfo.viewUploadedDocument")}
                          </Button>
                        )}
                        {(user.can_submit_verification ||
                          user.identity_verification_status === "rejected" ||
                          (user.identity_verification_status === "none" &&
                            !user.identity_verified) ||
                          (user.identity_verification_status === "pending" &&
                            !user.identity_verification_document_url)) && (
                          <Button
                            size="sm"
                            className="bg-[#FF0077] hover:bg-[#E6006A] text-white"
                            onClick={() => openEditModal("identity")}
                          >
                            {user.identity_verification_status === "rejected"
                              ? t("web.accountSettings.personalInfo.uploadNewDocument")
                              : t("web.accountSettings.personalInfo.startVerification")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.address")}
                  value={
                    user.address?.line1
                      ? `${user.address.line1}, ${user.address.city || ""}`
                      : t("web.accountSettings.personalInfo.notProvided")
                  }
                  isOptional
                  onEdit={user.address ? () => openEditModal("address") : undefined}
                  onAdd={!user.address ? () => openEditModal("address") : undefined}
                />

                {/* Emergency Contact */}
                <InfoRow
                  label={t("web.accountSettings.personalInfo.emergencyContact")}
                  value={user.emergency_contact?.name || t("web.accountSettings.personalInfo.notProvided")}
                  isPrivate
                  onEdit={user.emergency_contact?.name ? () => openEditModal("emergencyContact") : undefined}
                  onAdd={!user.emergency_contact?.name ? () => openEditModal("emergencyContact") : undefined}
                />
              </div>
        ) : null}
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
  const { t } = useTranslation();
  return (
    <div className="py-3 border-b border-zinc-200/50 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-zinc-900">{label}</span>
            {verified && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Check className="h-3 w-3" />
                {t("web.accountSettings.personalInfo.verified")}
              </span>
            )}
            {isPrivate && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {t("web.accountSettings.personalInfo.private")}
              </span>
            )}
            {isOptional && (
              <span className="text-xs text-zinc-400">{t("web.accountSettings.personalInfo.optional")}</span>
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
            <Edit className="h-4 w-4 me-1" />
            {t("web.accountSettings.personalInfo.edit")}
          </Button>
        )}
        {onAdd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdd}
            className="text-zinc-600 hover:text-[#FF0077]"
          >
            <Plus className="h-4 w-4 me-1" />
            {t("web.accountSettings.personalInfo.add")}
          </Button>
        )}
      </div>
    </div>
  );
}
