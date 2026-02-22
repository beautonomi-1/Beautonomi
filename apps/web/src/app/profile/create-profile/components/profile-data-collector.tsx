"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { CameraIcon, Save, ArrowLeft } from "lucide-react";
import Image from 'next/image';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compressImage } from "@/lib/utils/image-compression";
import type { UserProfile } from "@/types/beautonomi";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { Progress } from "@/components/ui/progress";

interface CollectedProfileData {
  avatar_url: string | null;
  about: string | null;
  school: string | null;
  work: string | null;
  location: string | null;
  languages: string[] | null;
  interests: string[] | null;
}

export default function ProfileDataCollector() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [avatarImage, setAvatarImage] = useState<string | null>(user?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Essential fields only
  const [about, setAbout] = useState<string>("");
  const [school, setSchool] = useState<string>("");
  const [work, setWork] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [languageInput, setLanguageInput] = useState<string>("");
  const [interestInput, setInterestInput] = useState<string>("");

  // Load existing profile data on mount
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user) return;
      try {
        const response = await fetcher.get<{ data: UserProfile }>("/api/me/profile-data");
        const data = response.data;
        if (data) {
          setAbout(data.about || "");
          setSchool(data.school || "");
          setWork(data.work || "");
          setLocation(data.location || "");
          setLanguages(data.languages || []);
          setInterests(data.interests || []);
          if (data.avatar_url) setAvatarImage(data.avatar_url);
        }
      } catch (error) {
        console.error("Failed to load user profile data:", error);
      }
    };
    loadProfileData();
  }, [user]);

  const handleAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        let finalFile: File = file;
        
        try {
          const compressionResult = await compressImage(file, {
            maxWidth: 500,
            maxHeight: 500,
            quality: 0.8,
            maxSizeMB: 1,
          });
          
          if (compressionResult && compressionResult.file && compressionResult.file instanceof Blob) {
            finalFile = new File([compressionResult.file], file.name, {
              type: compressionResult.file.type || file.type,
              lastModified: Date.now(),
            });
          }
        } catch (compressionError) {
          console.warn("Image compression failed, using original file:", compressionError);
        }
        
        setAvatarFile(finalFile);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            setAvatarImage(reader.result as string);
          }
        };
        reader.readAsDataURL(finalFile);
      } catch (error) {
        console.error("Error processing image:", error);
        toast.error("Failed to process image. Please try again.");
      }
    }
  };

  const addLanguage = () => {
    if (languageInput.trim() && !languages.includes(languageInput.trim())) {
      setLanguages([...languages, languageInput.trim()]);
      setLanguageInput("");
    }
  };

  const removeLanguage = (lang: string) => {
    setLanguages(languages.filter(l => l !== lang));
  };

  const addInterest = () => {
    if (interestInput.trim() && !interests.includes(interestInput.trim())) {
      setInterests([...interests, interestInput.trim()]);
      setInterestInput("");
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const handleSaveProfile = useCallback(async () => {
    if (!user) {
      toast.error("You must be logged in to save your profile.");
      return;
    }

    setIsSaving(true);
    try {
      let finalAvatarUrl = avatarImage;

      // Upload avatar if it's a new file
      if (avatarFile) {
        try {
          const formData = new FormData();
          formData.append('file', avatarFile);
          
          const response = await fetcher.post<{ data: { url: string } }>(
            "/api/me/avatar", 
            formData,
            { timeoutMs: 30000 }
          );
          
          if (!response.data || !response.data.url) {
            throw new Error("Invalid response from server");
          }
          
          finalAvatarUrl = response.data.url;
        } catch (error) {
          console.error("Error uploading avatar:", error);
          toast.error("Failed to upload avatar. Please try again.");
          setIsSaving(false);
          return;
        }
      }

      const profileData: CollectedProfileData = {
        avatar_url: finalAvatarUrl,
        about: about || null,
        school: school || null,
        work: work || null,
        location: location || null,
        languages: languages.length > 0 ? languages : null,
        interests: interests.length > 0 ? interests : null,
      };

      await fetcher.post("/api/me/profile-data", profileData);
      
      if (finalAvatarUrl && user.avatar_url !== finalAvatarUrl) {
        await fetcher.patch("/api/me/profile", { avatar_url: finalAvatarUrl });
      }

      toast.success("Profile saved successfully!");
      invalidateSetupStatusCache();
      refreshUser();
      
      // Check if we should return to get-started page
      const returnUrl = typeof window !== 'undefined' 
        ? sessionStorage.getItem('getStartedReturnUrl') 
        : null;
      
      if (returnUrl) {
        sessionStorage.removeItem('getStartedReturnUrl');
        sessionStorage.setItem('shouldRefreshSetupStatus', 'true');
        router.push(returnUrl);
      } else {
        router.push("/profile");
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    user,
    avatarImage,
    avatarFile,
    about,
    school,
    work,
    location,
    languages,
    interests,
    refreshUser,
    router,
  ]);

  // Calculate completion percentage
  const completedFields = [
    avatarImage,
    about,
    school,
    work,
    location,
    languages.length > 0,
    interests.length > 0,
  ].filter(Boolean).length;
  const completionPercentage = Math.round((completedFields / 7) * 100);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create Your Profile</h1>
          <p className="text-gray-600 mt-2">
            Help others get to know you better. All fields are optional.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-gray-600"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Profile Completion</span>
            <span className="text-sm text-gray-600">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </CardContent>
      </Card>

      {/* Profile Photo */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Add a photo so others can recognize you</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div onClick={handleAvatarClick} className="cursor-pointer">
              <Avatar className="w-24 h-24">
                {avatarImage ? (
                  <Image
                    src={avatarImage}
                    alt="Avatar"
                    width={96}
                    height={96}
                    className="object-cover rounded-full"
                    quality={100}
                  />
                ) : (
                  <AvatarFallback className="text-3xl font-bold">
                    {user?.full_name?.charAt(0).toUpperCase() || "A"}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>
            <div>
              <Button
                variant="outline"
                onClick={handleAvatarClick}
                className="mb-2"
              >
                <CameraIcon className="w-4 h-4 mr-2" />
                {avatarImage ? "Change Photo" : "Add Photo"}
              </Button>
              <p className="text-sm text-gray-500">
                Click to upload a photo from your device
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About You</CardTitle>
          <CardDescription>Tell others a bit about yourself</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Write something about yourself..."
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={4}
            maxLength={450}
            className="resize-none"
          />
          <p className="text-xs text-gray-500 mt-2">
            {about.length}/450 characters
          </p>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Share some basic details about yourself</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="school">Where I went to school</Label>
            <Input
              id="school"
              placeholder="e.g., University of Cape Town"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="work">My work</Label>
            <Input
              id="work"
              placeholder="e.g., Software Developer"
              value={work}
              onChange={(e) => setWork(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="location">Where I live</Label>
            <Input
              id="location"
              placeholder="e.g., Cape Town, South Africa"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle>Languages I Speak</CardTitle>
          <CardDescription>Add languages you can communicate in</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="e.g., English"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLanguage();
                }
              }}
            />
            <Button type="button" onClick={addLanguage} variant="outline">
              Add
            </Button>
          </div>
          {languages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {languages.map((lang) => (
                <div
                  key={lang}
                  className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full"
                >
                  <span className="text-sm">{lang}</span>
                  <button
                    onClick={() => removeLanguage(lang)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle>Interests</CardTitle>
          <CardDescription>What are you into? Add your interests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="e.g., Travel, Photography, Cooking"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addInterest();
                }
              }}
            />
            <Button type="button" onClick={addInterest} variant="outline">
              Add
            </Button>
          </div>
          {interests.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <div
                  key={interest}
                  className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full"
                >
                  <span className="text-sm">{interest}</span>
                  <button
                    onClick={() => removeInterest(interest)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg z-10">
        <div className="max-w-3xl mx-auto flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={isSaving}
            className="min-w-[120px]"
            size="lg"
          >
            {isSaving ? (
              <>
                <Save className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Profile
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
