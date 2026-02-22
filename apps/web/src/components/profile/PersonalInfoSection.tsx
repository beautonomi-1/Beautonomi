"use client";
import React, { useState, useEffect } from 'react';
import { toast } from "sonner";
import { Edit, Plus, Check, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import VerificationStatusCard from "./VerificationStatusCard";

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

interface VerificationData {
  status: "none" | "pending" | "verified" | "failed";
  submittedAt?: Date;
  failureReason?: string;
}

interface PersonalInfoSectionProps {
  onUpdate?: () => void;
}

const InfoItem: React.FC<{ 
  label: string; 
  value: string; 
  onEdit?: () => void; 
  onAdd?: () => void;
  verified?: boolean;
  isPrivate?: boolean;
  isOptional?: boolean;
}> = ({ label, value, onEdit, onAdd, verified, isPrivate, isOptional }) => (
  <div className="mb-4 pb-4 border-b border-gray-200 last:border-0">
    <div className="flex justify-between items-center mb-1">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-gray-900">{label}</span>
        {verified && (
          <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
            <Check className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        )}
        {isPrivate && (
          <Badge variant="outline" className="text-xs border-gray-300 text-gray-600 bg-gray-50">
            <Lock className="w-3 h-3 mr-1" />
            Private
          </Badge>
        )}
        {isOptional && (
          <Badge variant="outline" className="text-xs border-gray-300 text-gray-500 bg-gray-50">
            Optional
          </Badge>
        )}
      </div>
      {onEdit && (
        <button 
          className="text-sm text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors flex items-center gap-1" 
          onClick={onEdit}
        >
          <Edit className="w-3 h-3" />
          Edit
        </button>
      )}
      {onAdd && (
        <button 
          className="text-sm text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors flex items-center gap-1" 
          onClick={onAdd}
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      )}
    </div>
    <span className="text-sm text-gray-600">{value}</span>
  </div>
);

export default function PersonalInfoSection({ onUpdate }: PersonalInfoSectionProps) {
  // Auto-open if there are missing personal info fields (check via URL hash or prop)
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash === '#personal-info';
    }
    return false;
  });
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoData>({
    legalName: { first: '', last: '' },
    preferredName: 'Not provided',
    email: '',
    phone: '',
    governmentId: 'Not provided',
    address: {
      country: '',
      street: '',
      apt: '',
      city: '',
      state: '',
      zip: '',
    },
    emergencyContact: {
      name: '',
      relationship: '',
      language: '',
      email: '',
      countryCode: '',
      phone: '',
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>("+27");
  const [defaultCountry, setDefaultCountry] = useState<string>("South Africa");
  const [languages, _setLanguages] = useState<string[]>(['English']);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationData>({ status: "none" });

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        const [countriesResponse, settingsResponse, profileResponse] = await Promise.all([
          fetch("/api/public/countries"),
          fetch("/api/public/platform-settings"),
          fetch("/api/me/profile")
        ]);
        
        let loadedCountries: Country[] = [];
        if (countriesResponse.ok) {
          const countriesData = await countriesResponse.json();
          loadedCountries = countriesData.data || [];
          setCountries(loadedCountries);
        }
        
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          const defaultCountryCodeFromSettings = settingsData.data?.default_country_code || "+27";
          setDefaultCountryCode(defaultCountryCodeFromSettings);
          
          const country = loadedCountries.find(c => c.phone_country_code === defaultCountryCodeFromSettings);
          if (country) {
            setDefaultCountry(country.name);
          } else {
            const fallbackCountry = loadedCountries.find(c => c.code === "ZA") || loadedCountries[0];
            if (fallbackCountry) {
              setDefaultCountry(fallbackCountry.name);
            }
          }
        }
        
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          const profile = data.data;
          
          setEmailVerified(profile.email_verified || false);
          setPhoneVerified(profile.phone_verified || false);
          
          // Set verification status
          const verificationStatus = profile.identity_verification_status || 'none';
          setVerificationData({
            status: verificationStatus === 'approved' ? 'verified' : verificationStatus === 'rejected' ? 'failed' : verificationStatus,
            submittedAt: profile.identity_verification_submitted_at ? new Date(profile.identity_verification_submitted_at) : undefined,
            failureReason: profile.identity_verification_rejection_reason,
          });
          
          let maskedEmail = '';
          if (profile.email) {
            const emailParts = profile.email.split('@');
            if (emailParts[0].length > 0) {
              maskedEmail = `${emailParts[0].substring(0, 1)}****@${emailParts[1] || ''}`;
            } else {
              maskedEmail = profile.email;
            }
          }

          let maskedPhone = '';
          if (profile.phone) {
            const phoneStr = profile.phone.replace(/\D/g, '');
            if (phoneStr.length >= 4) {
              maskedPhone = `${phoneStr.substring(0, 3)} *** ***${phoneStr.substring(phoneStr.length - 4)}`;
            } else {
              maskedPhone = profile.phone;
            }
          }
          
          setPersonalInfo({
            legalName: {
              first: profile.first_name || '',
              last: profile.last_name || '',
            },
            preferredName: profile.preferred_name || 'Not provided',
            email: maskedEmail,
            phone: maskedPhone || 'Not provided',
            governmentId: profile.government_id ? 'Provided' : (profile.identity_verification_status === 'pending' ? 'Pending verification' : 'Not provided'),
            address: profile.address ? {
              country: profile.address.country || '',
              street: profile.address.line1 || '',
              apt: profile.address.line2 || '',
              city: profile.address.city || '',
              state: profile.address.state || '',
              zip: profile.address.postal_code || '',
            } : {
              country: '',
              street: '',
              apt: '',
              city: '',
              state: '',
              zip: '',
            },
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
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const openModal = (type: keyof PersonalInfoData) => {
    const content = getModalContent(type, countries, languages);
    setModalContent(content);
  };

  const closeModal = () => {
    setModalContent(null);
  };

  const saveChanges = async (type: keyof PersonalInfoData, newValue: any) => {
    try {
      setIsSaving(true);
      
      const updateData: any = {};
      
      if (type === 'legalName') {
        updateData.first_name = newValue.first;
        updateData.last_name = newValue.last;
      } else if (type === 'preferredName') {
        updateData.preferred_name = newValue.preferredName || null;
      } else if (type === 'email') {
        updateData.email = newValue.email;
      } else if (type === 'phone') {
        const countryCodeMatch = newValue.countryCode?.match(/\(([^)]+)\)/);
        const countryCode = countryCodeMatch ? countryCodeMatch[1] : '';
        updateData.phone = countryCode ? `${countryCode}${newValue.phone}` : newValue.phone;
      } else if (type === 'address') {
        updateData.address = {
          country: newValue.country,
          line1: newValue.street,
          line2: newValue.apt || '',
          city: newValue.city,
          state: newValue.state,
          postal_code: newValue.zip,
        };
      } else if (type === 'emergencyContact') {
        const countryCodeMatch = newValue.countryCode?.match(/\(([^)]+)\)/);
        const countryCode = countryCodeMatch ? countryCodeMatch[1] : '';
        updateData.emergency_contact = {
          name: newValue.name || null,
          relationship: newValue.relationship || null,
          language: newValue.language || null,
          email: newValue.email || null,
          country_code: countryCode || null,
          phone: newValue.phone || null,
        };
      } else if (type === 'governmentId') {
        const file = newValue.file;
        const documentType = newValue.documentType;
        const country = newValue.country || personalInfo.address.country || defaultCountry;

        if (!file) {
          toast.error("Please select a file to upload");
          return;
        }

        if (!documentType) {
          toast.error("Please select a document type");
          return;
        }

        if (!country) {
          toast.error("Please select a country");
          return;
        }

        const documentTypeMap: Record<string, string> = {
          "Driver's License": "license",
          "Passport": "passport",
          "National ID": "identity",
        };
        const apiDocumentType = documentTypeMap[documentType] || "identity";

        const formData = new FormData();
        formData.append('file', file);
        formData.append('document_type', apiDocumentType);
        formData.append('country', country);

        const verificationResponse = await fetch("/api/me/verification", {
          method: "POST",
          body: formData,
        });

        if (verificationResponse.ok) {
          toast.success("Government ID uploaded successfully! It will be reviewed by our team.");
          setPersonalInfo(prev => ({
            ...prev,
            governmentId: 'Pending verification',
          }));
          closeModal();
          onUpdate?.();
          return;
        } else {
          const error = await verificationResponse.json();
          toast.error(error.error?.message || "Failed to upload Government ID");
          return;
        }
      }

      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const reloadResponse = await fetch("/api/me/profile");
        if (reloadResponse.ok) {
          const reloadData = await reloadResponse.json();
          const profile = reloadData.data;
          
          let maskedEmail = '';
          if (profile.email) {
            const emailParts = profile.email.split('@');
            if (emailParts[0].length > 0) {
              maskedEmail = `${emailParts[0].substring(0, 1)}****@${emailParts[1] || ''}`;
            } else {
              maskedEmail = profile.email;
            }
          }

          let maskedPhone = '';
          if (profile.phone) {
            const phoneStr = profile.phone.replace(/\D/g, '');
            if (phoneStr.length >= 4) {
              maskedPhone = `${phoneStr.substring(0, 3)} *** ***${phoneStr.substring(phoneStr.length - 4)}`;
            } else {
              maskedPhone = profile.phone;
            }
          }

          setPersonalInfo({
            legalName: {
              first: profile.first_name || '',
              last: profile.last_name || '',
            },
            preferredName: profile.preferred_name || 'Not provided',
            email: maskedEmail,
            phone: maskedPhone || 'Not provided',
            governmentId: profile.government_id ? 'Provided' : (profile.identity_verification_status === 'pending' ? 'Pending verification' : 'Not provided'),
            address: profile.address ? {
              country: profile.address.country || '',
              street: profile.address.line1 || '',
              apt: profile.address.line2 || '',
              city: profile.address.city || '',
              state: profile.address.state || '',
              zip: profile.address.postal_code || '',
            } : {
              country: '',
              street: '',
              apt: '',
              city: '',
              state: '',
              zip: '',
            },
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
        toast.success("Changes saved successfully!");
        onUpdate?.();
      } else {
        const error = await response.json();
        toast.error(error.error?.message || "Failed to save changes");
      }
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const getModalContent = (type: keyof PersonalInfoData, countries: Country[] = [], languages: string[] = ['English']): ModalContent => {
    const phoneCountryOptions = countries
      .filter(c => c.phone_country_code)
      .map(c => `${c.name} (${c.phone_country_code})`);
    
    const addressCountryOptions = countries.map(c => c.name);
    const languageOptions = languages.length > 0 ? languages : ['English'];
    
    switch (type) {
      case 'legalName':
        return {
          type: 'legalName',
          title: 'Legal name',
          description: 'Make sure this matches the name on your government ID.',
          fields: [
            { name: 'first', label: 'First name on ID', type: 'text' },
            { name: 'last', label: 'Last name on ID', type: 'text' },
          ],
        };
      case 'preferredName':
        return {
          type: 'preferredName',
          title: 'Preferred name',
          description: 'This is how your first name will appear to Providers and clients.',
          fields: [
            { name: 'preferredName', label: 'Preferred name (optional)', type: 'text' },
          ],
        };
      case 'email':
        return {
          type: 'email',
          title: 'Email address',
          description: 'Use an address you\'ll always have access to.',
          fields: [
            { name: 'email', label: 'Email address', type: 'email' },
          ],
        };
      case 'phone':
        return {
          type: 'phone',
          title: 'Phone number',
          description: 'For notifications, reminders, and help logging in',
          fields: [
            { name: 'countryCode', label: 'Country code', type: 'select', options: phoneCountryOptions.length > 0 ? phoneCountryOptions : ['South Africa (+27)'] },
            { name: 'phone', label: 'Phone number', type: 'tel' },
          ],
        };
      case 'address':
        return {
          type: 'address',
          title: 'Address',
          description: 'Use a permanent address where you can receive mail.',
          fields: [
            { name: 'country', label: 'Country/region', type: 'select', options: addressCountryOptions.length > 0 ? addressCountryOptions : ['South Africa'] },
            { name: 'street', label: 'Street address', type: 'text' },
            { name: 'apt', label: 'Apt, suite. (optional)', type: 'text' },
            { name: 'city', label: 'City', type: 'text' },
            { name: 'state', label: 'State / Province / County / Region', type: 'text' },
            { name: 'zip', label: 'ZIP code', type: 'text' },
          ],
        };
      case 'emergencyContact':
        return {
          type: 'emergencyContact',
          title: 'Emergency contact',
          description: 'A trusted contact we can alert in an urgent situation.',
          fields: [
            { name: 'name', label: 'Name', type: 'text' },
            { name: 'relationship', label: 'Relationship', type: 'text' },
            { name: 'language', label: 'Preferred language', type: 'select', options: languageOptions },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'countryCode', label: 'Country code', type: 'select', options: phoneCountryOptions.length > 0 ? phoneCountryOptions : ['South Africa (+27)'] },
            { name: 'phone', label: 'Phone number', type: 'tel' },
          ],
        };
      case 'governmentId':
        return {
          type: 'governmentId',
          title: 'Government ID',
          description: 'Upload a government-issued ID for identity verification. This helps keep our community safe. Your document will be reviewed by our team.',
          fields: [
            { name: 'documentType', label: 'Document type', type: 'select', options: ['Driver\'s License', 'Passport', 'National ID'] },
            { name: 'country', label: 'Country', type: 'select', options: addressCountryOptions.length > 0 ? addressCountryOptions : ['South Africa'] },
            { name: 'file', label: 'Upload document', type: 'file', accept: 'image/*,.pdf' },
          ],
        };
      default:
        throw new Error(`Unknown modal type: ${type}`);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full bg-white border border-gray-200 shadow-sm">
        <CardHeader className="bg-white">
          <CardTitle className="text-lg font-semibold">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="bg-white">
          <p className="text-sm text-gray-600">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full bg-white border border-gray-200 shadow-sm">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-900">Personal Information</CardTitle>
                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden transition-all duration-300 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <CardContent className="pt-4 bg-white space-y-4">
              <InfoItem
                label="Legal name"
                value={`${personalInfo.legalName.first} ${personalInfo.legalName.last}`}
                onEdit={() => openModal('legalName')}
              />
              <InfoItem
                label="Preferred name"
                value={personalInfo.preferredName}
                onEdit={personalInfo.preferredName !== 'Not provided' ? () => openModal('preferredName') : undefined}
                onAdd={personalInfo.preferredName === 'Not provided' ? () => openModal('preferredName') : undefined}
              />
              <InfoItem
                label="Email address"
                value={personalInfo.email}
                onEdit={() => openModal('email')}
                verified={emailVerified}
              />
              <InfoItem
                label="Phone number"
                value={personalInfo.phone}
                onEdit={() => openModal('phone')}
                verified={phoneVerified}
              />
              
              {/* Government ID Verification Card */}
              <div>
                <label className="text-sm font-medium text-gray-900 mb-2 block">Government ID</label>
                <VerificationStatusCard
                  status={verificationData.status}
                  submittedAt={verificationData.submittedAt}
                  failureReason={verificationData.failureReason}
                  onAction={() => openModal('governmentId')}
                />
              </div>

              <InfoItem
                label="Address"
                value={personalInfo.address.street && personalInfo.address.city ? `${personalInfo.address.street}, ${personalInfo.address.city}` : 'Not provided'}
                onEdit={personalInfo.address.street ? () => openModal('address') : undefined}
                onAdd={!personalInfo.address.street ? () => openModal('address') : undefined}
                isOptional={true}
              />
              <InfoItem
                label="Emergency contact"
                value={personalInfo.emergencyContact.name ? personalInfo.emergencyContact.name : 'Not provided'}
                onAdd={!personalInfo.emergencyContact.name ? () => openModal('emergencyContact') : undefined}
                onEdit={personalInfo.emergencyContact.name ? () => openModal('emergencyContact') : undefined}
                isPrivate={true}
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {modalContent && (
        <PersonalInfoModal
          content={modalContent}
          onClose={closeModal}
          onSave={(newValue) => saveChanges(modalContent.type, newValue)}
          isSaving={isSaving}
          initialData={personalInfo}
          countries={countries}
          defaultCountryCode={defaultCountryCode}
          defaultCountry={defaultCountry}
          languages={languages}
        />
      )}
    </>
  );
}

// Import the Modal component from personal-info page
// For now, I'll create a simplified version here
function PersonalInfoModal({ content, onClose, onSave, isSaving, initialData, countries, defaultCountryCode, defaultCountry, languages }: any) {
  const getInitialFormData = () => {
    if (!initialData) return {};
    
    switch (content.type) {
      case 'legalName':
        return { first: initialData.legalName.first, last: initialData.legalName.last };
      case 'preferredName':
        return { preferredName: initialData.preferredName !== 'Not provided' ? initialData.preferredName : '' };
      case 'email':
        return { email: '' };
      case 'phone':
        const defaultPhoneCountry = countries.find((c: Country) => c.phone_country_code === defaultCountryCode) || countries[0];
        return {
          countryCode: defaultPhoneCountry ? `${defaultPhoneCountry.name} (${defaultPhoneCountry.phone_country_code})` : `${defaultCountry} (${defaultCountryCode})`,
          phone: '',
        };
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
        const defaultECCountry = countries.find((c: Country) => c.phone_country_code === defaultCountryCode) || countries[0];
        return {
          name: initialData.emergencyContact.name || '',
          relationship: initialData.emergencyContact.relationship || '',
          language: initialData.emergencyContact.language || languages[0] || 'English',
          email: initialData.emergencyContact.email || '',
          countryCode: initialData.emergencyContact.countryCode ? 
            (initialData.emergencyContact.countryCode.includes('+') 
              ? countries.find((c: Country) => c.phone_country_code === initialData.emergencyContact.countryCode) 
                ? `${countries.find((c: Country) => c.phone_country_code === initialData.emergencyContact.countryCode)!.name} (${initialData.emergencyContact.countryCode})`
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

  const [formData, setFormData] = useState<any>(getInitialFormData());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setFormData(getInitialFormData());
      setSelectedFile(null);
      setFilePreview(null);
    });
  }, [content.type, initialData, countries, defaultCountryCode, defaultCountry, languages]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when modal content deps change

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
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
    if (content.type === 'governmentId' && selectedFile) {
      onSave({ ...formData, file: selectedFile });
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
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="mb-4 text-gray-600 text-sm">{content.description}</p>
        <form onSubmit={handleSubmit}>
          {content.fields.map((field: any) => (
            <div key={field.name} className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700" htmlFor={field.name}>
                {field.label}
              </label>
              {field.type === 'file' ? (
                <div>
                  <input
                    type="file"
                    id={field.name}
                    name={field.name}
                    accept={field.accept || "image/*,.pdf"}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                    onChange={handleFileChange}
                    required={content.type === 'governmentId'}
                  />
                  {filePreview && (
                    <div className="mt-2">
                      <img src={filePreview} alt="Preview" className="max-w-full h-48 object-contain border border-gray-300 rounded-md" />
                    </div>
                  )}
                  {selectedFile && !filePreview && (
                    <div className="mt-2 text-sm text-gray-600">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Accepted formats: JPEG, PNG, WebP, PDF (Max 10MB)
                  </p>
                </div>
              ) : field.type === 'select' ? (
                <select
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                  onChange={handleChange}
                  required={field.name !== 'apt' && field.name !== 'line2'}
                >
                  <option value="">Select {field.label}</option>
                  {field.options?.map((option: string) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ''}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:border-transparent"
                  onChange={handleChange}
                  required={field.name !== 'apt' && field.name !== 'line2' && field.name !== 'preferredName'}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (content.type === 'governmentId' && !selectedFile)}
              className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving
                ? "Uploading..."
                : content.type === "phone"
                ? "Verify"
                : content.type === "governmentId"
                ? "Upload for Verification"
                : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
