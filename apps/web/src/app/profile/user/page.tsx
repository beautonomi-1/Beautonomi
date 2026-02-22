'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Upload, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Breadcrumb from "@/components/ui/breadcrumb";

// Define types
type Option = {
  id: string;
  label: string;
  description?: string;
};

const User = () => {
  const [showChooseIdType, setShowChooseIdType] = useState(false);
  const [selectedOption, setSelectedOption] = useState("upload");

  const options: Option[] = [
    {
      id: "upload",
      label: "Upload an existing photo",
      description: "Recommended",
    },
    {
      id: "webcam",
      label: "Take photo with your webcam",
      description: "",
    },
  ];

  const handleContinue = () => {
    setShowChooseIdType(true);
  };

  if (showChooseIdType) {
    return <ChooseIdType onBack={() => setShowChooseIdType(false)} />;
  }

  return (
    <div className="mx-auto p-4 max-w-4xl">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: "Profile", href: "/profile" },
        { label: "Verify Identity" }
      ]} />
      <div className="flex flex-col md:flex-row justify-between place-items-start">
        <div className="w-full md:max-w-md">
          <h2 className="text-[22px] font-medium text-secondary mb-2">
            {"Let's add your government ID"}
          </h2>
          <p className="text-base font-light text-secondary mb-6">
            {"We'll"} need you to add an official government ID. This step helps make sure {"you're"} really you.
          </p>
          <div className="">
            {options.map((option) => (
              <div
                key={option.id}
                className="flex items-start border-b py-4 mb-2 flex-row-reverse"
              >
                <input
                  type="radio"
                  id={option.id}
                  name="photoOption"
                  value={option.id}
                  checked={selectedOption === option.id}
                  onChange={() => setSelectedOption(option.id)}
                  className={`mt-1 h-5 w-5 cursor-pointer appearance-none rounded-full 
                  ${selectedOption === option.id ? 'border-[6px] border-black' : 'border-[2px] border-gray-400'}`}
                />
                <label htmlFor={option.id} className="flex-grow">
                  <div className="font-bold font-lg text-black mb-2">
                    {option.label}
                  </div>
                  {option.description && (
                    <p className="text-base text-black mb-2">
                      {option.description}
                    </p>
                  )}
                </label>
              </div>
            ))}
          </div>
          <div className="text-right">
            <Button variant="default" className="my-4" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </div>
        <div className="border px-7 py-9 w-full md:max-w-80 rounded-lg">
          <div>
            <p className="mb-3 text-lg font-medium text-black">Your privacy</p>
          </div>
          <div>
            <p className="text-base text-black font-light">
              We aim to keep the data you share during this process private, safe, and secure. Learn more in our {" "}
            </p>
            <a href="#" className="text-black underline">
                Privacy Policy
            </a>
            <br />
            <br />
            <a href="#" className="text-base text-black underline">
              How identity verification works
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChooseIdType = ({ onBack }: { onBack: () => void }) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [country, setCountry] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<string>("license");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<any>(null);

  // Load existing verification status
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetcher.get<{ data: any }>("/api/me/verification");
        setVerificationStatus(response.data);
      } catch (error) {
        console.error("Failed to load verification status:", error);
      }
    };
    loadStatus();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.");
        return;
      }

      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error("File size exceeds 10MB limit.");
        return;
      }

      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !country || !selectedOption) {
      toast.error("Please select a file, country, and ID type.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('document_type', selectedOption);
      formData.append('country', country);

      await fetcher.post("/api/me/verification", formData);
      
      toast.success("Verification document uploaded successfully! It will be reviewed shortly.");
      router.push("/profile");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload document. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const options: Option[] = [
    {
      id: "license",
      label: "Driver's license",
    },
    {
      id: "passport",
      label: "Passport",
    },
    {
      id: "identity",
      label: "Identity card",
    },
  ];

  // Show status if already verified or pending
  if (verificationStatus?.status === 'approved') {
    return (
      <div className="container p-6 space-y-6 max-w-4xl mx-auto">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Profile", href: "/profile" },
          { label: "Verify Identity" }
        ]} />
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-green-800 mb-2">Identity Verified</h2>
          <p className="text-green-700 mb-4">Your identity has been successfully verified.</p>
          <Button onClick={() => router.push("/profile")}>Back to Profile</Button>
        </div>
      </div>
    );
  }

  if (verificationStatus?.status === 'pending') {
    return (
      <div className="container p-6 space-y-6 max-w-4xl mx-auto">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Profile", href: "/profile" },
          { label: "Verify Identity" }
        ]} />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <Loader2 className="h-16 w-16 text-yellow-500 mx-auto mb-4 animate-spin" />
          <h2 className="text-2xl font-semibold text-yellow-800 mb-2">Verification Pending</h2>
          <p className="text-yellow-700 mb-4">Your verification document is under review. We'll notify you once it's processed.</p>
          <Button onClick={() => router.push("/profile")}>Back to Profile</Button>
        </div>
      </div>
    );
  }

  if (verificationStatus?.status === 'rejected') {
    return (
      <div className="container p-6 space-y-6 max-w-4xl mx-auto">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Profile", href: "/profile" },
          { label: "Verify Identity" }
        ]} />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-red-800 mb-2">Verification Rejected</h2>
          <p className="text-red-700 mb-4">Your verification was rejected. Please try again with a clearer document.</p>
          <Button onClick={() => {
            setVerificationStatus(null);
            setSelectedFile(null);
            setPreviewUrl(null);
          }}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container p-6 space-y-6 max-w-4xl mx-auto">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: "Profile", href: "/profile" },
        { label: "Verify Identity" }
      ]} />
        <div className='w-full max-w-full md:max-w-xl'>
      <h2 className="text-[22px] font-medium text-secondary mb-4">Choose an ID type to add</h2>

      <div className="border rounded-md -space-y-2 mb-4">
        <Label htmlFor="country" className="text-xs pl-3 text-destructive">
          Country/region
        </Label>
        <Select value={country} onValueChange={setCountry} >
          <SelectTrigger id="country" className="border-none">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent position="popper" className='bg-white'>
            <SelectItem value="">Select a country</SelectItem>
            <SelectItem value="Pakistan">Pakistan</SelectItem>
            <SelectItem value="United States">United States</SelectItem>
            <SelectItem value="Canada">Canada</SelectItem>
            <SelectItem value="United Kingdom">United Kingdom</SelectItem>
            <SelectItem value="South Africa">South Africa</SelectItem>
            <SelectItem value="Nigeria">Nigeria</SelectItem>
            <SelectItem value="Kenya">Kenya</SelectItem>
            <SelectItem value="Ghana">Ghana</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div>
          {options.map((option, index) => (
            <div
              key={option.id}
              className={`flex items-start py-5 mb-2 flex-row-reverse ${
                index !== options.length - 1 ? "border-b" : ""
              }`}
            >
              <input
                type="radio"
                id={option.id}
                name="photoOption"
                value={option.id}
                checked={selectedOption === option.id}
                onChange={() => setSelectedOption(option.id)}
                className={`mt-1 h-5 w-5 cursor-pointer appearance-none rounded-full 
                  ${
                    selectedOption === option.id
                      ? "border-[6px] border-black"
                      : "border-[2px] border-gray-400"
                  }`}
              />
              <label htmlFor={option.id} className="flex-grow">
                <div className="font-light text-lg text-black mb-2">
                  {option.label}
                </div>
                {option.description && (
                  <p className="text-base text-black mb-2">
                    {option.description}
                  </p>
                )}
              </label>
            </div>
          ))}
        </div>
      </div>
      {/* File Upload Section */}
      <div className="border rounded-md p-4 mb-4">
        <Label htmlFor="file-upload" className="text-base font-medium mb-2 block">
          Upload Document
        </Label>
        <input
          ref={fileInputRef}
          type="file"
          id="file-upload"
          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full mb-2"
        >
          <Upload className="h-4 w-4 mr-2" />
          {selectedFile ? "Change File" : "Select File"}
        </Button>
        {selectedFile && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">Selected: {selectedFile.name}</p>
            <p className="text-xs text-gray-500">Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            {previewUrl && (
              <div className="mt-2 border rounded p-2">
                <Image
                  src={previewUrl}
                  alt="Preview"
                  width={300}
                  height={200}
                  className="max-w-full h-auto rounded"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className='border-b mb-5 pb-6'>
        <div className="bg-primary p-4 rounded-md ">
          <p className='text-destructive text-sm font-light'>
            Your ID will be handled according to our{" "}
            <a href="#" className="text-black underline">
              Privacy Policy
            </a>{" "}
            and {"won't"} be shared with your Beauty Partner or clients.
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <button className="underline text-black flex text-lg" onClick={onBack}>
          <ChevronLeft />
          Back
        </button>
        <Button 
          onClick={handleUpload}
          disabled={!selectedFile || !country || !selectedOption || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            "Upload & Submit"
          )}
        </Button>
      </div>
      </div>
    </div>
  );
};

export default User;
