"use client";
import Image from "next/image";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import VerificationStatusCard from "@/components/profile/VerificationStatusCard";
import { toast } from "sonner";
import { useTranslation, type TFunction } from "@beautonomi/i18n";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import {
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
} from "@/lib/supabase/auth-sms-otp";
import { normalizeFullPhoneToE164 } from "@/lib/phone";
import { getCachedDefaultPhoneDial } from "@/lib/user-default-phone-dial";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isMailableEmail } from "@beautonomi/utils";
import type { PersonalInfoInitialPayload } from "./fetch-personal-info-initial";

interface PersonalInfoData {
  legalName: { first: string; last: string };
  preferredName: string;
  email: string;
  phone: string;
  governmentId: string;
  address: {
    country: string;
    street: string;
    apt: string;
    city: string;
    state: string;
    zip: string;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    language: string;
    email: string;
    countryCode: string;
    phone: string;
  };
}

interface ModalContent {
  type: keyof PersonalInfoData;
  title: string;
  description: string;
  fields: { name: string; label: string; type: string; options?: string[]; accept?: string }[];
}

interface Country {
  code: string;
  name: string;
  phone_country_code: string | null;
}

const NOT_PROVIDED_SENTINEL = "Not provided";

const emptyPersonalInfo = (): PersonalInfoData => ({
  legalName: { first: "", last: "" },
  preferredName: NOT_PROVIDED_SENTINEL,
  email: "",
  phone: "",
  governmentId: NOT_PROVIDED_SENTINEL,
  address: {
    country: "",
    street: "",
    apt: "",
    city: "",
    state: "",
    zip: "",
  },
  emergencyContact: {
    name: "",
    relationship: "",
    language: "",
    email: "",
    countryCode: "",
    phone: "",
  },
});

function mergeFromServer(initial: PersonalInfoInitialPayload): PersonalInfoData {
  if (!initial.personalInfo) return emptyPersonalInfo();
  const pi = initial.personalInfo;
  return {
    legalName: { ...pi.legalName },
    preferredName: pi.preferredName,
    email: pi.email,
    phone: pi.phone,
    governmentId: pi.governmentId,
    address: { ...pi.address },
    emergencyContact: { ...pi.emergencyContact },
  };
}

export function PersonalInfoClient({ initial }: { initial: PersonalInfoInitialPayload }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoData>(() => mergeFromServer(initial));
  const [isLoading, setIsLoading] = useState(() => !initial.personalInfo);
  const [isSaving, setIsSaving] = useState(false);
  const [sumsubAvailable, setSumsubAvailable] = useState(initial.sumsubAvailable);
  const [verificationStatus, setVerificationStatus] = useState<
    "none" | "pending" | "verified" | "failed"
  >("none");
  const [verificationCanSubmit, setVerificationCanSubmit] = useState(false);
  const [verificationFailureReason, setVerificationFailureReason] = useState<string | undefined>();

  const refreshVerification = useCallback(async () => {
    try {
      const res = await fetch("/api/me/verification");
      if (!res.ok) return;
      const json = await res.json();
      const d = json?.data;
      if (!d) return;
      const verified = Boolean(d.verified);
      const status = (d.status as string) ?? "none";
      setVerificationCanSubmit(Boolean(d.can_submit_verification));
      // Didit is the active automated KYC provider (sumsub removed).
      setSumsubAvailable(Boolean(d.didit_available));
      if (verified || status === "approved") {
        setVerificationStatus("verified");
      } else if (
        status === "pending" ||
        status === "in_progress" ||
        status === "submitted" ||
        status === "under_review"
      ) {
        setVerificationStatus("pending");
      } else if (status === "rejected") {
        setVerificationStatus("failed");
        const submissions = Array.isArray(d.submissions) ? d.submissions : [];
        const reason = submissions.find((s: { rejection_reason?: string }) => s.rejection_reason)
          ?.rejection_reason;
        setVerificationFailureReason(reason);
      } else {
        setVerificationStatus("none");
        setVerificationFailureReason(undefined);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    void refreshVerification();
    const onFocus = () => {
      void refreshVerification();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshVerification]);
  const [countries, setCountries] = useState<Country[]>(initial.countries);
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>(() => {
    const fromServer = initial.defaultCountryCode;
    if (fromServer) return fromServer;
    if (typeof window !== "undefined") {
      const d = getCachedDefaultPhoneDial();
      if (d) return d;
    }
    return "+27";
  });
  const [defaultCountry, setDefaultCountry] = useState<string>(initial.defaultCountry || "South Africa");
  const [languages] = useState<string[]>(['English']);
  const [_selectedFile, setSelectedFile] = useState<File | null>(null);
  const [_filePreview, setFilePreview] = useState<string | null>(null);
  // Phone change verification (Supabase OTP)
  const [phoneStep, setPhoneStep] = useState<'enter_phone' | 'enter_otp'>('enter_phone');
  const [pendingPhoneE164, setPendingPhoneE164] = useState<string>('');
  const [phoneOtpCode, setPhoneOtpCode] = useState<string>('');
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [emailStep, setEmailStep] = useState<'enter_email' | 'enter_otp'>('enter_email');
  const [pendingEmailForOtp, setPendingEmailForOtp] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);

  const openModal = (type: keyof PersonalInfoData) => {
    const content = getModalContent(type, countries, languages, t);
    setModalContent(content);
  };

  const closeModal = () => {
    setModalContent(null);
    setPhoneStep('enter_phone');
    setPendingPhoneE164('');
    setPhoneOtpCode('');
    setEmailStep('enter_email');
    setPendingEmailForOtp('');
    setEmailOtpCode('');
    // Reset file state when modal closes
    setSelectedFile(null);
    setFilePreview(null);
  };

  const saveChanges = async (type: keyof PersonalInfoData, newValue: Record<string, unknown>) => {
    try {
      setIsSaving(true);
      
      // Map form data to API format
      const updateData: Record<string, unknown> = {};
      
      if (type === 'legalName') {
        updateData.first_name = newValue.first as string;
        updateData.last_name = newValue.last as string;
      } else if (type === 'preferredName') {
        updateData.preferred_name = (newValue.preferredName as string) || null;
      } else if (type === 'phone') {
        // Accept full E164 from PhoneInput (e.g. "+27823456789") or legacy countryCode + phone
        if (typeof newValue.phone === "string" && newValue.phone.startsWith("+")) {
          updateData.phone = (newValue.phone as string).replace(/\s/g, "");
        } else {
          const countryCode = (newValue.countryCode as string)?.match(/\(([^)]+)\)/)?.[1] ?? "";
          updateData.phone = countryCode ? `${countryCode}${newValue.phone}` : newValue.phone;
        }
      } else if (type === 'address') {
        updateData.address = {
          country: newValue.country,
          line1: newValue.street,
          line2: (newValue.apt as string) || '',
          city: newValue.city,
          state: newValue.state,
          postal_code: newValue.zip,
        };
      } else if (type === 'emergencyContact') {
        // Extract country code from select value
        const countryCode = ((newValue.countryCode as string)?.match(/\(([^)]+)\)/)?.[1]) ?? '';
        updateData.emergency_contact = {
          name: (newValue.name as string) || null,
          relationship: newValue.relationship || null,
          language: newValue.language || null,
          email: newValue.email || null,
          country_code: countryCode || null,
          phone: newValue.phone || null,
        };
      } else if (type === 'governmentId') {
        // Handle Government ID upload
        const file = newValue.file;
        const documentType = newValue.documentType;
        const country = newValue.country || personalInfo.address.country || defaultCountry;

        if (!file) {
          toast.error(t("web.accountSettings.personalInfo.selectFile"));
          return;
        }

        if (!documentType) {
          toast.error(t("web.accountSettings.personalInfo.selectDocType"));
          return;
        }

        if (!country) {
          toast.error(t("web.accountSettings.personalInfo.selectCountry"));
          return;
        }

        // Map UI document type to API format
        const documentTypeMap: Record<string, string> = {
          "Driver's License": "license",
          "Passport": "passport",
          "National ID": "identity",
        };
        const apiDocumentType = documentTypeMap[String(documentType)] || "identity";

        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', file as Blob);
        formData.append('document_type', apiDocumentType);
        formData.append('country', String(country));

        const verificationResponse = await fetch("/api/me/verification", {
          method: "POST",
          body: formData,
        });

        if (verificationResponse.ok) {
          await verificationResponse.json();
          toast.success(t("web.accountSettings.personalInfo.idUploaded"));
          
          // Update personal info to show "Pending verification"
          setPersonalInfo(prev => ({
            ...prev,
            governmentId: t('web.accountSettings.personalInfo.pendingVerification'),
          }));
          await refreshVerification();
          closeModal();
        } else {
          const error = await verificationResponse.json();
          toast.error(error.error?.message || t("web.accountSettings.personalInfo.idUploadFailed"));
        }
        return;
      }

      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const json = await response.json();
        const profile = json?.data;
        if (profile?.email_change_pending) {
          closeModal();
          toast.success(
            t("web.accountSettings.personalInfo.emailChangePending"),
          );
          router.refresh();
          return;
        }
        if (profile) {
          let maskedEmail = '';
          if (profile.email) {
            const emailParts = profile.email.split('@');
            maskedEmail = emailParts[0]?.length > 0 ? `${emailParts[0].substring(0, 1)}****@${emailParts[1] || ''}` : profile.email;
          }
          let maskedPhone = '';
          if (profile.phone) {
            const phoneStr = profile.phone.replace(/\D/g, '');
            maskedPhone = phoneStr.length >= 4 ? `${phoneStr.substring(0, 3)} *** ***${phoneStr.substring(phoneStr.length - 4)}` : profile.phone;
          }
          setPersonalInfo({
            legalName: { first: profile.first_name || '', last: profile.last_name || '' },
            preferredName: profile.preferred_name || t('web.accountSettings.personalInfo.notProvided'),
            email: maskedEmail,
            phone: maskedPhone || t('web.accountSettings.personalInfo.notProvided'),
            governmentId: profile.government_id ? t('web.accountSettings.personalInfo.provided') : (personalInfo.governmentId || t('web.accountSettings.personalInfo.notProvided')),
            address: profile.address ? {
              country: profile.address.country || '',
              street: profile.address.line1 || '',
              apt: profile.address.line2 || '',
              city: profile.address.city || '',
              state: profile.address.state || '',
              zip: profile.address.postal_code || '',
            } : { country: '', street: '', apt: '', city: '', state: '', zip: '' },
            emergencyContact: {
              name: profile.emergency_contact?.name || '',
              relationship: profile.emergency_contact?.relationship || '',
              language: profile.emergency_contact?.language || '',
              email: profile.emergency_contact?.email || '',
              countryCode: profile.emergency_contact?.country_code || '',
              phone: profile.emergency_contact?.phone || '',
            },
          });
        }
        closeModal();
        toast.success(t("web.accountSettings.personalInfo.changesSaved"));
        router.refresh();
      } else {
        const error = await response.json();
        toast.error(error.error?.message || t("web.accountSettings.personalInfo.saveFailed"));
      }
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error(t("web.accountSettings.personalInfo.errorGeneric"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendEmailOtp = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !isMailableEmail(trimmed)) {
      toast.error(t("web.accountSettings.personalInfo.enterValidEmail"));
      return;
    }
    setIsSendingEmailOtp(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      setPendingEmailForOtp(trimmed);
      setEmailStep('enter_otp');
      setEmailOtpCode('');
      toast.success(t("web.accountSettings.personalInfo.emailCodeSent"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.personalInfo.emailSendFailed"));
    } finally {
      setIsSendingEmailOtp(false);
    }
  };

  const handleVerifyEmailOtp = async (otp: string) => {
    const token = normalizeSupabaseSmsOtpToken(otp);
    if (!pendingEmailForOtp || !isCompleteSupabaseSmsOtp(token)) return;
    setIsSaving(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmailForOtp,
        token,
        type: "email_change",
      });
      if (error) throw error;
      await fetch("/api/me/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmailForOtp }),
      });
      const emailParts = pendingEmailForOtp.split('@');
      const maskedEmail = emailParts[0]?.length > 0
        ? `${emailParts[0].substring(0, 1)}****@${emailParts[1] || ''}`
        : pendingEmailForOtp;
      setPersonalInfo((prev) => ({ ...prev, email: maskedEmail }));
      closeModal();
      toast.success(t("web.accountSettings.personalInfo.emailUpdated"));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.personalInfo.verifyFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPhoneOtp = async (e164: string) => {
    if (!e164 || !e164.startsWith("+")) return;
    const normalized = normalizeSupabaseAuthPhone(e164);
    setIsSendingPhoneOtp(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;
      setPendingPhoneE164(normalized);
      setPhoneStep('enter_otp');
      setPhoneOtpCode('');
      toast.success(t("web.accountSettings.personalInfo.phoneCodeSent"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("web.accountSettings.personalInfo.emailSendFailed");
      toast.error(msg);
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async (otp: string) => {
    const token = normalizeSupabaseSmsOtpToken(otp);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) return;
    setIsSaving(true);
    try {
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(pendingPhoneE164);
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "phone_change",
      });
      if (error) throw error;
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || t("web.accountSettings.personalInfo.phoneSaveFailed"));
      }
      const json = await response.json();
      const profile = json?.data;
      if (profile?.phone) {
        const phoneStr = profile.phone.replace(/\D/g, "");
        const maskedPhone = phoneStr.length >= 4 ? `${phoneStr.substring(0, 3)} *** ***${phoneStr.substring(phoneStr.length - 4)}` : profile.phone;
        setPersonalInfo((prev) => ({ ...prev, phone: maskedPhone }));
      }
      closeModal();
      toast.success(t("web.accountSettings.personalInfo.phoneUpdated"));
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("web.accountSettings.personalInfo.verifyFailed");
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 font-sans">
      <BackButton href="/account-settings" />
      <Breadcrumb 
        items={[
          { label: t("web.accountSettings.account"), href: "/account-settings" },
          { label: t("web.accountSettings.personalInfo.title") }
        ]} 
      />
      
      <h1 className="text-2xl md:text-3xl font-bold mb-6 md:mb-8 text-gray-900">{t("web.accountSettings.personalInfo.title")}</h1>
      
      {isLoading ? (
        <p className="text-gray-600">{t("web.accountSettings.personalInfo.loading")}</p>
      ) : (
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-2/3 lg:pe-8">
          <InfoItem
            label={t("web.accountSettings.personalInfo.legalName")}
            value={`${personalInfo.legalName.first} ${personalInfo.legalName.last}`}
            onEdit={() => openModal('legalName')}
          />
          <InfoItem
            label={t("web.accountSettings.personalInfo.preferredName")}
            value={personalInfo.preferredName}
            onEdit={personalInfo.preferredName !== NOT_PROVIDED_SENTINEL ? () => openModal('preferredName') : undefined}
            onAdd={personalInfo.preferredName === NOT_PROVIDED_SENTINEL ? () => openModal('preferredName') : undefined}
          />
          <InfoItem
            label={t("web.accountSettings.personalInfo.emailAddress")}
            value={personalInfo.email}
            onEdit={() => openModal('email')}
            editLabel={t("web.accountSettings.personalInfo.changeEmail")}
          />
          <InfoItem
            label={t("web.accountSettings.personalInfo.phoneNumber")}
            value={personalInfo.phone}
            onEdit={() => openModal('phone')}
            editLabel={t("web.accountSettings.personalInfo.changePhone")}
          />
          <div className="mb-4 md:mb-6 pb-4 md:pb-6 border-b border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-sm md:text-base text-gray-900">{t("web.accountSettings.personalInfo.governmentId")}</span>
              <Link
                href="/account-settings/identity-verification"
                className="text-sm text-[#FF0077] hover:text-[#D60565] underline font-medium"
              >
                {t("web.accountSettings.personalInfo.manageVerification")}
              </Link>
            </div>
            <VerificationStatusCard
              status={verificationStatus}
              failureReason={verificationFailureReason}
              onAction={() => {
                if (verificationCanSubmit) {
                  openModal("governmentId");
                } else {
                  window.location.href = "/account-settings/identity-verification";
                }
              }}
            />
          </div>
          <InfoItem
            label={t("web.accountSettings.personalInfo.address")}
            value={personalInfo.address.street && personalInfo.address.city ? `${personalInfo.address.street}, ${personalInfo.address.city}` : t('web.accountSettings.personalInfo.notProvided')}
            onEdit={personalInfo.address.street ? () => openModal('address') : undefined}
            onAdd={!personalInfo.address.street ? () => openModal('address') : undefined}
          />
          <InfoItem
            label={t("web.accountSettings.personalInfo.emergencyContact")}
            value={personalInfo.emergencyContact.name ? personalInfo.emergencyContact.name : t('web.accountSettings.personalInfo.notProvided')}
            onAdd={!personalInfo.emergencyContact.name ? () => openModal('emergencyContact') : undefined}
            onEdit={personalInfo.emergencyContact.name ? () => openModal('emergencyContact') : undefined}
          />
        </div>
        <div className="w-full lg:w-1/3 border border-gray-200 px-4 md:px-6 py-4 md:py-6 rounded-xl h-full bg-gray-50">
      <InfoCard
        title={t("web.accountSettings.whyInfoHidden")}
        content={t("web.accountSettings.infoHiddenContent")}
        img="/icons/infoed.svg"
      />
      <InfoCard
        title={t("web.accountSettings.whichDetailsEditable")}
        content={t("web.accountSettings.detailsEditableContent")}
        img="/icons/locked.svg"
      />
      <InfoCard
        title={t("web.accountSettings.whatInfoShared")}
        content={t("web.accountSettings.infoSharedContent")}
        img="/icons/eyed.svg"
      />
    </div>
      </div>
      )}
      {modalContent && (
        <Modal
          content={modalContent}
          onClose={closeModal}
          onSave={(newValue) => saveChanges(modalContent.type, newValue)}
          isSaving={isSaving}
          initialData={personalInfo}
          countries={countries}
          defaultCountryCode={defaultCountryCode}
          defaultCountry={defaultCountry}
          languages={languages}
          phoneStep={phoneStep}
          pendingPhoneE164={pendingPhoneE164}
          phoneOtpCode={phoneOtpCode}
          setPhoneOtpCode={setPhoneOtpCode}
          setPhoneStep={setPhoneStep}
          onSendPhoneOtp={handleSendPhoneOtp}
          onVerifyPhoneOtp={handleVerifyPhoneOtp}
          isSendingPhoneOtp={isSendingPhoneOtp}
          emailStep={emailStep}
          pendingEmailForOtp={pendingEmailForOtp}
          emailOtpCode={emailOtpCode}
          setEmailOtpCode={setEmailOtpCode}
          setEmailStep={setEmailStep}
          onSendEmailOtp={handleSendEmailOtp}
          onVerifyEmailOtp={handleVerifyEmailOtp}
          isSendingEmailOtp={isSendingEmailOtp}
          sumsubAvailable={sumsubAvailable}
        />
      )}
      </div>
  );
}

const InfoItem: React.FC<{ label: string; value: string; onEdit?: () => void; onAdd?: () => void; editLabel?: string }> = ({ label, value, onEdit, onAdd, editLabel }) => {
  const { t } = useTranslation();
  return (
  <div className="mb-4 md:mb-6 pb-4 md:pb-6 border-b border-gray-200">
    <div className="flex justify-between items-center mb-1 md:mb-2">
      <span className="font-medium text-sm md:text-base text-gray-900">{label}</span>
      {onEdit && (
        <button 
          className="text-sm md:text-base text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors active:opacity-70" 
          onClick={onEdit}
        >
          {editLabel ?? t("web.accountSettings.personalInfo.edit")}
        </button>
      )}
      {onAdd && (
        <button 
          className="text-sm md:text-base text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors active:opacity-70" 
          onClick={onAdd}
        >
          {t("web.accountSettings.personalInfo.add")}
        </button>
      )}
    </div>
    <span className="text-sm md:text-base text-gray-600">{value}</span>
  </div>
  );
};

const InfoCard: React.FC<{ title: string; content: string; img: string | { src: string } }> = ({ title, content, img }) => (
  <div className="mb-4 md:mb-5 pb-4 md:pb-5 border-b border-gray-200 last:border-0">
   <Image src={typeof img === "string" ? img : img.src} width={35} height={35} alt={title} className="mb-2" />
    <h3 className="font-medium text-sm md:text-base my-2 text-gray-900">{title}</h3>
    <p className="text-xs md:text-sm text-gray-600 font-light leading-relaxed">{content}</p>
  </div>
);

interface ModalProps {
  content: ModalContent;
  onClose: () => void;
  onSave: (newValue: Record<string, unknown>) => void;
  isSaving: boolean;
  initialData?: PersonalInfoData;
  countries?: Country[];
  defaultCountryCode?: string;
  defaultCountry?: string;
  languages?: string[];
  phoneStep?: 'enter_phone' | 'enter_otp';
  pendingPhoneE164?: string;
  phoneOtpCode?: string;
  setPhoneOtpCode?: (v: string) => void;
  setPhoneStep?: (step: 'enter_phone' | 'enter_otp') => void;
  onSendPhoneOtp?: (e164: string) => void | Promise<void>;
  onVerifyPhoneOtp?: (otp: string) => void | Promise<void>;
  isSendingPhoneOtp?: boolean;
  emailStep?: 'enter_email' | 'enter_otp';
  pendingEmailForOtp?: string;
  emailOtpCode?: string;
  setEmailOtpCode?: (v: string) => void;
  setEmailStep?: (step: 'enter_email' | 'enter_otp') => void;
  onSendEmailOtp?: (email: string) => void | Promise<void>;
  onVerifyEmailOtp?: (otp: string) => void | Promise<void>;
  isSendingEmailOtp?: boolean;
  /** Whether SumSub automated verification is available — shows an "Verify instantly" CTA */
  sumsubAvailable?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  content,
  onClose,
  onSave,
  isSaving,
  initialData,
  countries = [],
  defaultCountryCode = "+27",
  defaultCountry = "South Africa",
  languages = ['English'],
  phoneStep = 'enter_phone',
  pendingPhoneE164 = '',
  phoneOtpCode = '',
  setPhoneOtpCode,
  setPhoneStep,
  onSendPhoneOtp,
  onVerifyPhoneOtp,
  isSendingPhoneOtp = false,
  emailStep = 'enter_email',
  pendingEmailForOtp = '',
  emailOtpCode = '',
  setEmailOtpCode,
  setEmailStep,
  onSendEmailOtp,
  onVerifyEmailOtp,
  isSendingEmailOtp = false,
  sumsubAvailable = false,
}) => {
  const { t } = useTranslation();
  const [sumsubLaunching, setSumsubLaunching] = React.useState(false);

  // Didit automated KYC lives on the dedicated identity-verification page
  // (confirm-legal-details + hosted flow). Route the user there rather than
  // launching an inline SDK from the profile field editor.
  const launchSumsub = React.useCallback(async () => {
    setSumsubLaunching(true);
    try {
      window.location.href = "/account-settings/identity-verification";
    } finally {
      setSumsubLaunching(false);
    }
  }, []);
  // Initialize form data with existing values
  const getInitialFormData = () => {
    if (!initialData) return {};
    
    switch (content.type) {
      case 'legalName':
        return {
          first: initialData.legalName.first,
          last: initialData.legalName.last,
        };
      case 'preferredName':
        return {
          preferredName: initialData.preferredName !== t('web.accountSettings.personalInfo.notProvided') ? initialData.preferredName : '',
        };
      case 'email':
        // For email, we can't extract the full email from masked value
        // So we'll just use empty and let user re-enter
        return {
          email: '',
        };
      case 'phone':
        return { phoneFull: '' };
      case 'address':
        return {
          country: initialData.address.country || defaultCountry,
          street: initialData.address.street,
          apt: initialData.address.apt,
          city: initialData.address.city,
          state: initialData.address.state,
          zip: initialData.address.zip,
        };
      case 'emergencyContact':
        const defaultECCountry = countries.find(c => c.phone_country_code === defaultCountryCode) || countries[0];
        return {
          name: initialData.emergencyContact.name || '',
          relationship: initialData.emergencyContact.relationship || '',
          language: initialData.emergencyContact.language || languages[0] || 'English',
          email: initialData.emergencyContact.email || '',
          countryCode: initialData.emergencyContact.countryCode ? 
            (initialData.emergencyContact.countryCode.includes('+') 
              ? countries.find(c => c.phone_country_code === initialData.emergencyContact.countryCode) 
                ? `${countries.find(c => c.phone_country_code === initialData.emergencyContact.countryCode)!.name} (${initialData.emergencyContact.countryCode})`
                : initialData.emergencyContact.countryCode
              : initialData.emergencyContact.countryCode) 
            : (defaultECCountry ? `${defaultECCountry.name} (${defaultECCountry.phone_country_code})` : `${defaultCountry} (${defaultCountryCode})`),
          phone: initialData.emergencyContact.phone || '',
        };
      case 'governmentId':
        return {
          documentType: '',
          country: initialData.address.country || defaultCountry,
          file: null,
        };
      default:
        return {};
    }
  };

  const [formData, setFormData] = useState<Record<string, unknown>>(getInitialFormData());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Reset form data and file when modal content changes
  useEffect(() => {
    queueMicrotask(() => {
      setFormData(getInitialFormData());
      setSelectedFile(null);
      setFilePreview(null);
    });
  }, [content.type, initialData, countries, defaultCountryCode, defaultCountry, languages]); // eslint-disable-line react-hooks/exhaustive-deps -- getInitialFormData is stable; reset when modal content deps change

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.type === "governmentId" && selectedFile) {
      onSave({ ...formData, file: selectedFile });
    } else if (content.type === "phone") {
      // Phone uses OTP flow: Send code → Verify; handled by onSendPhoneOtp / onVerifyPhoneOtp
      return;
    } else if (content.type === "email") {
      return;
    } else {
      onSave(formData);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white p-6 rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{content.title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label={t("web.a11y.close")}
          >
            ×
          </button>
        </div>
        <p className="mb-4 text-gray-600 text-sm">{content.description}</p>
        <form onSubmit={handleSubmit}>
          {content.type === "email" && emailStep === "enter_otp" ? (
            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-1 font-medium">{t("web.accountSettings.personalInfo.enterVerificationCode")}</p>
              <p className="mb-4 text-sm leading-relaxed text-gray-600">
                {t("web.accountSettings.personalInfo.emailOtpSentBody", { digits: SUPABASE_AUTH_OTP_LENGTH, email: pendingEmailForOtp })}
              </p>
              <OtpDigitInput
                length={SUPABASE_AUTH_OTP_LENGTH}
                value={emailOtpCode}
                onChange={(v) => setEmailOtpCode?.(v)}
                onComplete={(code) => {
                  if (!isSaving && isCompleteSupabaseSmsOtp(code)) void onVerifyEmailOtp?.(code);
                }}
                disabled={isSaving}
                autoFocus
                label={t("web.accountSettings.personalInfo.emailVerificationCode")}
                className="mb-3"
              />
              <button
                type="button"
                onClick={() => {
                  setEmailStep?.("enter_email");
                  setEmailOtpCode?.("");
                }}
                className="mt-3 text-sm text-[#FF0077] hover:text-[#D60565] underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSaving}
              >
                {t("web.accountSettings.personalInfo.wrongEmailGoBack")}
              </button>
            </div>
          ) : content.type === "email" ? (
            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor="email">
                {t("web.accountSettings.personalInfo.emailAddress")}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={String(formData.email ?? "")}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                onChange={handleChange}
                required
              />
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {t("web.accountSettings.personalInfo.emailOtpHint", { digits: SUPABASE_AUTH_OTP_LENGTH })}
              </p>
            </div>
          ) : content.type === "phone" && phoneStep === "enter_otp" ? (
            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-1 font-medium">{t("web.accountSettings.personalInfo.enterVerificationCode")}</p>
              <p className="mb-4 text-sm leading-relaxed text-gray-600">
                {t("web.accountSettings.personalInfo.phoneOtpSentBody", {
                  digits: SUPABASE_AUTH_OTP_LENGTH,
                  phone: pendingPhoneE164,
                  minutes: Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60)),
                  minuteLabel:
                    Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1
                      ? t("web.accountSettings.personalInfo.minute")
                      : t("web.accountSettings.personalInfo.minutes"),
                })}
              </p>
              <OtpDigitInput
                length={SUPABASE_AUTH_OTP_LENGTH}
                value={phoneOtpCode}
                onChange={(v) => setPhoneOtpCode?.(v)}
                onComplete={(code) => {
                  if (!isSaving && isCompleteSupabaseSmsOtp(code)) void onVerifyPhoneOtp?.(code);
                }}
                disabled={isSaving}
                autoFocus
                label={t("web.accountSettings.personalInfo.phoneVerificationCode")}
                className="mb-3"
              />
              <button
                type="button"
                onClick={() => {
                  setPhoneStep?.("enter_phone");
                  setPhoneOtpCode?.("");
                }}
                className="mt-3 text-sm text-[#FF0077] hover:text-[#D60565] underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSaving}
              >
                {t("web.accountSettings.personalInfo.wrongNumberGoBack")}
              </button>
            </div>
          ) : content.type === "phone" ? (
            <div className="mb-6">
              <PhoneInput
                label={t("web.accountSettings.personalInfo.phoneNumber")}
                value={String(formData.phoneFull ?? "")}
                onChange={(v) => setFormData((prev) => ({ ...prev, phoneFull: v }))}
                placeholder={t("web.accountSettings.personalInfo.phoneExample")}
              />
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {t("web.accountSettings.personalInfo.phoneOtpHint", {
                  digits: SUPABASE_AUTH_OTP_LENGTH,
                  minutes: Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60)),
                  minuteLabel:
                    Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1
                      ? t("web.accountSettings.personalInfo.minute")
                      : t("web.accountSettings.personalInfo.minutes"),
                })}
              </p>
            </div>
          ) : (
          content.fields.map((field) => (
            <div key={field.name} className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor={field.name}>
                {field.label}
              </label>
              {field.type === 'file' ? (
                <div>
                  {/* SumSub automated option — shown when available */}
                  {content.type === 'governmentId' && sumsubAvailable && (
                    <div className="mb-4 p-4 bg-pink-50 border border-pink-200 rounded-lg">
                      <p className="text-sm font-medium text-gray-800 mb-2">{t("web.accountSettings.personalInfo.verifyInstantly")}</p>
                      <p className="text-xs text-gray-600 mb-3">
                        {t("web.accountSettings.personalInfo.verifyInstantlyHint")}
                      </p>
                      <button
                        type="button"
                        onClick={launchSumsub}
                        disabled={sumsubLaunching}
                        className="w-full py-2 px-4 bg-[#FF0077] text-white text-sm font-medium rounded-md hover:bg-[#e6006b] disabled:opacity-60"
                      >
                        {sumsubLaunching ? t("web.accountSettings.personalInfo.opening") : t("web.accountSettings.personalInfo.verifyInstantlyCta")}
                      </button>
                      <div className="flex items-center gap-2 mt-4 mb-1">
                        <hr className="flex-1 border-gray-300" />
                        <span className="text-xs text-gray-400">{t("web.accountSettings.personalInfo.orUploadManually")}</span>
                        <hr className="flex-1 border-gray-300" />
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    id={field.name}
                    name={field.name}
                    accept={field.accept || "image/*,.pdf"}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                    onChange={handleFileChange}
                    required={content.type === 'governmentId' && !sumsubAvailable}
                  />
                  {filePreview && (
                    <div className="mt-2 relative w-full h-48">
                      <Image src={filePreview} alt={t("web.accountSettings.personalInfo.preview")} fill className="object-contain border border-gray-300 rounded-md" unoptimized />
                    </div>
                  )}
                  {selectedFile && !filePreview && (
                    <div className="mt-2 text-sm text-gray-600">
                      {t("web.accountSettings.personalInfo.selectedFile", { name: selectedFile.name, size: (selectedFile.size / 1024 / 1024).toFixed(2) })}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {t("web.accountSettings.personalInfo.acceptedFormats")}
                  </p>
                </div>
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={String(formData[field.name] ?? "")}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                  onChange={handleChange}
                  required={field.name !== 'apt' && field.name !== 'line2'}
                >
                  <option value="">{t("web.accountSettings.personalInfo.selectLabel", { label: field.label })}</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>{
                      content.type === "governmentId" && field.name === "documentType"
                        ? option === "Driver's License"
                          ? t("web.accountSettings.personalInfo.driversLicense")
                          : option === "Passport"
                            ? t("web.accountSettings.personalInfo.passport")
                            : option === "National ID"
                              ? t("web.accountSettings.personalInfo.nationalId")
                              : option
                        : option
                    }</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={String(formData[field.name] ?? "")}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                  onChange={handleChange}
                  required={field.name !== 'apt' && field.name !== 'line2' && field.name !== 'preferredName'}
                />
              )}
            </div>
          ))
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isSendingPhoneOtp}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("web.accountSettings.personalInfo.cancel")}
            </button>
            {content.type === "email" && emailStep === "enter_email" ? (
              <button
                type="button"
                disabled={!String(formData.email ?? "").trim() || isSendingEmailOtp}
                onClick={() => onSendEmailOtp?.(String(formData.email ?? ""))}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingEmailOtp ? t("web.accountSettings.personalInfo.sending") : t("web.accountSettings.personalInfo.sendVerificationCode")}
              </button>
            ) : content.type === "email" && emailStep === "enter_otp" ? (
              <button
                type="button"
                disabled={!isCompleteSupabaseSmsOtp(emailOtpCode) || isSaving}
                onClick={() => onVerifyEmailOtp?.(normalizeSupabaseSmsOtpToken(emailOtpCode))}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? t("web.accountSettings.personalInfo.verifying") : t("web.accountSettings.personalInfo.verifyAndSave")}
              </button>
            ) : content.type === "phone" && phoneStep === "enter_phone" ? (
              <button
                type="button"
                disabled={!normalizeFullPhoneToE164(String(formData.phoneFull ?? "")) || isSendingPhoneOtp}
                onClick={() => {
                  const e164 = normalizeFullPhoneToE164(String(formData.phoneFull ?? "")) ?? "";
                  if (e164) onSendPhoneOtp?.(e164);
                }}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingPhoneOtp ? t("web.accountSettings.personalInfo.sending") : t("web.accountSettings.personalInfo.sendVerificationCode")}
              </button>
            ) : content.type === "phone" && phoneStep === "enter_otp" ? (
              <button
                type="button"
                disabled={!isCompleteSupabaseSmsOtp(phoneOtpCode) || isSaving}
                onClick={() => onVerifyPhoneOtp?.(normalizeSupabaseSmsOtpToken(phoneOtpCode))}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? t("web.accountSettings.personalInfo.verifying") : t("web.accountSettings.personalInfo.verifyAndSave")}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  isSaving ||
                  (content.type === "governmentId" && !selectedFile) ||
                  (content.type === "phone" && !normalizeFullPhoneToE164(String(formData.phoneFull ?? "")))
                }
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving
                  ? t("web.accountSettings.personalInfo.uploading")
                  : content.type === "governmentId"
                  ? t("web.accountSettings.personalInfo.uploadForVerification")
                  : t("web.accountSettings.personalInfo.save")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const getModalContent = (type: keyof PersonalInfoData, countries: Country[] = [], languages: string[] = ['English'], t: TFunction): ModalContent => {
  // Generate country options for phone
  const phoneCountryOptions = countries
    .filter(c => c.phone_country_code)
    .map(c => `${c.name} (${c.phone_country_code})`);
  
  // Generate country options for address
  const addressCountryOptions = countries.map(c => c.name);
  
  // Generate language options
  const languageOptions = languages.length > 0 ? languages : ['English'];
  
  switch (type) {
    case 'legalName':
      return {
        type: 'legalName',
        title: t("web.accountSettings.personalInfo.modalLegalName"),
        description: t("web.accountSettings.personalInfo.modalLegalNameDesc"),
        fields: [
          { name: 'first', label: t("web.accountSettings.personalInfo.firstNameOnId"), type: 'text' },
          { name: 'last', label: t("web.accountSettings.personalInfo.lastNameOnId"), type: 'text' },
        ],
      };
    case 'preferredName':
      return {
        type: 'preferredName',
        title: t("web.accountSettings.personalInfo.modalPreferredName"),
        description: t("web.accountSettings.personalInfo.modalPreferredNameDesc"),
        fields: [
          { name: 'preferredName', label: t("web.accountSettings.personalInfo.preferredNameOptional"), type: 'text' },
        ],
      };
    case 'email':
      return {
        type: 'email',
        title: t("web.accountSettings.personalInfo.modalEmail"),
        description: t("web.accountSettings.personalInfo.modalEmailDesc", { digits: SUPABASE_AUTH_OTP_LENGTH }),
        fields: [
          { name: 'email', label: t("web.accountSettings.personalInfo.emailAddress"), type: 'email' },
        ],
      };
    case 'phone':
      return {
        type: 'phone',
        title: t("web.accountSettings.personalInfo.modalPhone"),
        description: t("web.accountSettings.personalInfo.modalPhoneDesc"),
        fields: [
          { name: 'countryCode', label: t("web.accountSettings.personalInfo.countryCode"), type: 'select', options: phoneCountryOptions.length > 0 ? phoneCountryOptions : [t("web.accountSettings.personalInfo.southAfricaPhone")] },
          { name: 'phone', label: t("web.accountSettings.personalInfo.phoneNumber"), type: 'tel' },
        ],
      };
    case 'address':
      return {
        type: 'address',
        title: t("web.accountSettings.personalInfo.modalAddress"),
        description: t("web.accountSettings.personalInfo.modalAddressDesc"),
        fields: [
          { name: 'country', label: t("web.accountSettings.personalInfo.countryRegion"), type: 'select', options: addressCountryOptions.length > 0 ? addressCountryOptions : [t("web.accountSettings.personalInfo.southAfrica")] },
          { name: 'street', label: t("web.accountSettings.personalInfo.streetAddress"), type: 'text' },
          { name: 'apt', label: t("web.accountSettings.personalInfo.aptOptional"), type: 'text' },
          { name: 'city', label: t("web.accountSettings.personalInfo.city"), type: 'text' },
          { name: 'state', label: t("web.accountSettings.personalInfo.stateRegion"), type: 'text' },
          { name: 'zip', label: t("web.accountSettings.personalInfo.zipCode"), type: 'text' },
        ],
      };
    case 'emergencyContact':
      return {
        type: 'emergencyContact',
        title: t("web.accountSettings.personalInfo.modalEmergency"),
        description: t("web.accountSettings.personalInfo.modalEmergencyDesc"),
        fields: [
          { name: 'name', label: t("web.accountSettings.personalInfo.name"), type: 'text' },
          { name: 'relationship', label: t("web.accountSettings.personalInfo.relationship"), type: 'text' },
          { name: 'language', label: t("web.accountSettings.personalInfo.preferredLanguage"), type: 'select', options: languageOptions },
          { name: 'email', label: t("web.accountSettings.personalInfo.emailAddress"), type: 'email' },
          { name: 'countryCode', label: t("web.accountSettings.personalInfo.countryCode"), type: 'select', options: phoneCountryOptions.length > 0 ? phoneCountryOptions : [t("web.accountSettings.personalInfo.southAfricaPhone")] },
          { name: 'phone', label: t("web.accountSettings.personalInfo.phoneNumber"), type: 'tel' },
        ],
      };
    case 'governmentId':
      return {
        type: 'governmentId',
        title: t("web.accountSettings.personalInfo.modalGovId"),
        description: t("web.accountSettings.personalInfo.modalGovIdDesc"),
        fields: [
          { name: 'documentType', label: t("web.accountSettings.personalInfo.documentType"), type: 'select', options: ['Driver\'s License', 'Passport', 'National ID'] },
          { name: 'country', label: t("web.accountSettings.personalInfo.country"), type: 'select', options: addressCountryOptions.length > 0 ? addressCountryOptions : [t("web.accountSettings.personalInfo.southAfrica")] },
          { name: 'file', label: t("web.accountSettings.personalInfo.uploadDocument"), type: 'file', accept: 'image/*,.pdf' },
        ],
      };
    default:
      throw new Error(`Unknown modal type: ${type}`);
  }
};
