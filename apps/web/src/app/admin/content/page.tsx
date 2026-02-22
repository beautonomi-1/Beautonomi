"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  HelpCircle,
  BookOpen,
  MapPin,
  FileText,
  Settings,
  Users,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { FooterLinkCard } from "./components/FooterLinkCard";
import { FooterLinkModal } from "./components/FooterLinkModal";
import { AppLinkModal } from "./components/AppLinkModal";
import { ProfileQuestionCard } from "./components/ProfileQuestionCard";
import { ProfileQuestionModal } from "./components/ProfileQuestionModal";
import { FooterSettingsCard } from "./components/FooterSettingsCard";
import { FooterSettingsModal } from "./components/FooterSettingsModal";
import { SocialMediaCard } from "./components/SocialMediaCard";
import { SocialMediaModal } from "./components/SocialMediaModal";
import { PreferenceOptionCard } from "./components/PreferenceOptionCard";
import { PreferenceOptionModal } from "./components/PreferenceOptionModal";
import { AboutUsCard } from "./components/AboutUsCard";
import { AboutUsModal } from "./components/AboutUsModal";
import { SignupPageCard } from "./components/SignupPageCard";
import { SignupPageModal } from "./components/SignupPageModal";
import WysiwygEditor from "@/components/admin/WysiwygEditor";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  is_active: boolean;
}

interface Resource {
  id: string;
  title: string;
  content: string;
  type: "article" | "guide" | "video";
  url?: string;
  is_active: boolean;
}

interface FeaturedCity {
  id: string;
  name: string;
  country: string;
  image_url?: string;
  description?: string;
  provider_count: number;
  is_active: boolean;
}

interface PageContent {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, any>;
  order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface FooterLink {
  id: string;
  section: "about" | "business" | "legal" | "social" | "apps";
  title: string;
  href: string;
  display_order: number;
  is_external: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AppLink {
  id: string;
  platform: "ios" | "android";
  title: string;
  href: string;
  display_order: number;
  is_active: boolean;
}

interface AboutUsContent {
  id: string;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_active: boolean;
}

export default function AdminContent() {
  const [activeTab, setActiveTab] = useState<"faqs" | "resources" | "cities" | "pages" | "footer" | "apps" | "profile-questions" | "footer-settings" | "social-media" | "preference-options" | "about-us" | "signup-page">("faqs");
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [cities, setCities] = useState<FeaturedCity[]>([]);
  const [pages, setPages] = useState<PageContent[]>([]);
  const [footerLinks, setFooterLinks] = useState<FooterLink[]>([]);
  const [appLinks, setAppLinks] = useState<AppLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageFilter, setPageFilter] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [showFAQModal, setShowFAQModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showPageModal, setShowPageModal] = useState(false);
  const [showFooterModal, setShowFooterModal] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [editingCity, setEditingCity] = useState<FeaturedCity | null>(null);
  const [editingPage, setEditingPage] = useState<PageContent | null>(null);
  const [editingFooterLink, setEditingFooterLink] = useState<FooterLink | null>(null);
  const [editingAppLink, setEditingAppLink] = useState<AppLink | null>(null);
  const [profileQuestions, setProfileQuestions] = useState<any[]>([]);
  const [showProfileQuestionModal, setShowProfileQuestionModal] = useState(false);
  const [editingProfileQuestion, setEditingProfileQuestion] = useState<any | null>(null);
  const [footerSettings, setFooterSettings] = useState<any[]>([]);
  const [showFooterSettingsModal, setShowFooterSettingsModal] = useState(false);
  const [editingFooterSetting, setEditingFooterSetting] = useState<any | null>(null);
  const [socialMediaLinks, setSocialMediaLinks] = useState<FooterLink[]>([]);
  const [showSocialMediaModal, setShowSocialMediaModal] = useState(false);
  const [editingSocialMediaLink, setEditingSocialMediaLink] = useState<FooterLink | null>(null);
  const [preferenceOptions, setPreferenceOptions] = useState<any[]>([]);
  const [showPreferenceOptionModal, setShowPreferenceOptionModal] = useState(false);
  const [editingPreferenceOption, setEditingPreferenceOption] = useState<any | null>(null);
  const [preferenceOptionType, setPreferenceOptionType] = useState<'language' | 'currency' | 'timezone'>('language');
  const [aboutUsContent, setAboutUsContent] = useState<AboutUsContent[]>([]);
  const [showAboutUsModal, setShowAboutUsModal] = useState(false);
  const [editingAboutUsContent, setEditingAboutUsContent] = useState<AboutUsContent | null>(null);
  const [signupPageContent, setSignupPageContent] = useState<PageContent[]>([]);
  const [showSignupPageModal, setShowSignupPageModal] = useState(false);
  const [editingSignupPageContent, setEditingSignupPageContent] = useState<PageContent | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab, preferenceOptionType]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (activeTab === "faqs") {
        const response = await fetcher.get<{ data: FAQ[]; error: null }>("/api/admin/content/faqs");
        setFaqs(response.data || []);
      } else if (activeTab === "resources") {
        const response = await fetcher.get<{ data: Resource[]; error: null }>("/api/admin/content/resources");
        setResources(response.data || []);
      } else if (activeTab === "cities") {
        const response = await fetcher.get<{ data: FeaturedCity[]; error: null }>("/api/admin/content/featured-cities");
        setCities(response.data || []);
      } else if (activeTab === "pages") {
        const url = pageFilter ? `/api/admin/content/pages?page_slug=${encodeURIComponent(pageFilter)}` : "/api/admin/content/pages";
        const response = await fetcher.get<{ data: PageContent[]; error: null }>(url);
        setPages(response.data || []);
      } else if (activeTab === "footer") {
        const url = sectionFilter ? `/api/admin/content/footer-links?section=${encodeURIComponent(sectionFilter)}&include_inactive=true` : "/api/admin/content/footer-links?include_inactive=true";
        const response = await fetcher.get<{ data: FooterLink[]; error: null }>(url);
        setFooterLinks(response.data || []);
      } else if (activeTab === "apps") {
        const response = await fetcher.get<{ data: AppLink[]; error: null }>("/api/admin/content/app-links?include_inactive=true");
        setAppLinks(response.data || []);
      } else if (activeTab === "profile-questions") {
        const response = await fetcher.get<{ data: any[]; error: null }>("/api/admin/content/profile-questions");
        setProfileQuestions(response.data || []);
      } else if (activeTab === "footer-settings") {
        const response = await fetcher.get<{ data: any[]; error: null }>("/api/admin/content/footer-settings");
        setFooterSettings(response.data || []);
      } else if (activeTab === "social-media") {
        const response = await fetcher.get<{ data: FooterLink[]; error: null }>("/api/admin/content/footer-links?section=social&include_inactive=true");
        setSocialMediaLinks(response.data || []);
      } else if (activeTab === "preference-options") {
        const response = await fetcher.get<{ data: any[]; error: null }>(`/api/admin/content/preference-options?type=${preferenceOptionType}`);
        setPreferenceOptions(response.data || []);
      } else if (activeTab === "about-us") {
        const response = await fetcher.get<{ data: AboutUsContent[]; error: null }>("/api/admin/content/about-us");
        setAboutUsContent(response.data || []);
      } else if (activeTab === "signup-page") {
        const response = await fetcher.get<{ data: PageContent[]; error: null }>("/api/admin/content/pages?page_slug=signup");
        setSignupPageContent(response.data || []);
      }
    } catch {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load content";
      setError(errorMessage);
      console.error("Error loading content:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFAQ = async (id: string) => {
    if (!confirm("Are you sure you want to delete this FAQ?")) return;
    try {
      await fetcher.delete(`/api/admin/content/faqs/${id}`);
      toast.success("FAQ deleted");
      loadData();
    } catch {
      toast.error("Failed to delete FAQ");
    }
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    try {
      await fetcher.delete(`/api/admin/content/resources/${id}`);
      toast.success("Resource deleted");
      loadData();
    } catch {
      toast.error("Failed to delete resource");
    }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm("Are you sure you want to remove this featured city?")) return;
    try {
      await fetcher.delete(`/api/admin/content/featured-cities/${id}`);
      toast.success("City removed");
      loadData();
    } catch {
      toast.error("Failed to remove city");
    }
  };

  const handleDeletePage = async (id: string) => {
    if (!confirm("Are you sure you want to delete this page content?")) return;
    try {
      await fetcher.delete(`/api/admin/content/pages/${id}`);
      toast.success("Page content deleted");
      loadData();
    } catch {
      toast.error("Failed to delete page content");
    }
  };

  const handleDeleteFooterLink = async (id: string) => {
    if (!confirm("Are you sure you want to delete this footer link?")) return;
    try {
      await fetcher.delete(`/api/admin/content/footer-links/${id}`);
      toast.success("Footer link deleted");
      loadData();
    } catch {
      toast.error("Failed to delete footer link");
    }
  };

  // Reserved for app links delete UI
   
  const _handleDeleteAppLink = async (id: string) => {
    if (!confirm("Are you sure you want to delete this app link?")) return;
    try {
      await fetcher.delete(`/api/admin/content/app-links/${id}`);
      toast.success("App link deleted");
      loadData();
    } catch {
      toast.error("Failed to delete app link");
    }
  };

  const filteredFAQs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredResources = resources.filter((resource) =>
    resource.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCities = cities.filter((city) =>
    city.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPages = pages.filter((page) => {
    const matchesSearch = 
      page.page_slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.section_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPageFilter = !pageFilter || page.page_slug === pageFilter;
    return matchesSearch && matchesPageFilter;
  });

  const filteredFooterLinks = footerLinks.filter((link) => {
    const matchesSearch = 
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.href.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.section.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSectionFilter = !sectionFilter || link.section === sectionFilter;
    return matchesSearch && matchesSectionFilter;
  });

  const _filteredAppLinks = appLinks.filter((link) =>
    link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.href.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.platform.toLowerCase().includes(searchQuery.toLowerCase())
  ); // reserved for app links filter UI

  const filteredAboutUsContent = aboutUsContent.filter((content) =>
    content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    content.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    content.section_key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get unique page slugs for filter
  const pageSlugs = Array.from(new Set(pages.map((p) => p.page_slug))).sort();
  
  // Get unique sections for footer links filter
  const footerSections = Array.from(new Set(footerLinks.map((l) => l.section))).sort();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading content..." />
      </div>
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
            <div className="mb-6 sm:mb-8">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tighter mb-2 text-gray-900"
              >
                Content Management
              </motion.h1>
              <p className="text-sm sm:text-base font-light text-gray-600">Manage FAQs, resources, and featured cities</p>
            </div>

            <div>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="w-full sm:w-auto overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <TabsList className="inline-flex w-full sm:w-auto backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-1 shadow-lg min-w-max sm:min-w-0">
                    <TabsTrigger value="faqs" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">FAQs</span>
                    <span className="sm:hidden">FAQ</span>
                  </TabsTrigger>
                    <TabsTrigger value="resources" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Resources</span>
                      <span className="sm:hidden">Res</span>
                    </TabsTrigger>
                    <TabsTrigger value="cities" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Cities</span>
                      <span className="sm:hidden">City</span>
                    </TabsTrigger>
                    <TabsTrigger value="pages" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Pages
                    </TabsTrigger>
                    <TabsTrigger value="footer" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Footer</span>
                      <span className="sm:hidden">Foot</span>
                    </TabsTrigger>
                    <TabsTrigger value="apps" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Apps
                    </TabsTrigger>
                    <TabsTrigger value="profile-questions" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Profile Questions</span>
                      <span className="lg:hidden">Profile</span>
                    </TabsTrigger>
                    <TabsTrigger value="footer-settings" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Footer Settings</span>
                      <span className="lg:hidden">Footer</span>
                    </TabsTrigger>
                    <TabsTrigger value="social-media" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Social Media</span>
                      <span className="lg:hidden">Social</span>
                    </TabsTrigger>
                    <TabsTrigger value="preference-options" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Preferences</span>
                      <span className="lg:hidden">Prefs</span>
                    </TabsTrigger>
                    <TabsTrigger value="about-us" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">About Us</span>
                    <span className="sm:hidden">About</span>
                  </TabsTrigger>
                    <TabsTrigger value="signup-page" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden lg:inline">Signup Page</span>
                    <span className="lg:hidden">Signup</span>
                  </TabsTrigger>
                </TabsList>
              </div>
                <div className="flex-shrink-0">
                  {activeTab === "faqs" && (
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button onClick={() => setShowFAQModal(true)} className="w-full sm:w-auto bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white shadow-lg">
                        <Plus className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Add FAQ</span>
                        <span className="sm:hidden">Add</span>
                      </Button>
                    </motion.div>
                  )}
                {activeTab === "resources" && (
                  <Button onClick={() => setShowResourceModal(true)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Resource</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "cities" && (
                  <Button onClick={() => setShowCityModal(true)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add City</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "pages" && (
                  <Button onClick={() => setShowPageModal(true)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Page</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "footer" && (
                  <Button onClick={() => setShowFooterModal(true)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Link</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "apps" && (
                  <Button onClick={() => setShowAppModal(true)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add App Link</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "profile-questions" && (
                  <Button onClick={() => {
                    setEditingProfileQuestion(null);
                    setShowProfileQuestionModal(true);
                  }} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Question</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "preference-options" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                    <Select value={preferenceOptionType} onValueChange={(v: any) => {
                      setPreferenceOptionType(v);
                    }}>
                      <SelectTrigger className="w-full sm:w-40 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="language">Languages</SelectItem>
                        <SelectItem value="currency">Currencies</SelectItem>
                        <SelectItem value="timezone">Timezones</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => {
                      setEditingPreferenceOption(null);
                      setShowPreferenceOptionModal(true);
                    }} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">
                        Add {preferenceOptionType === 'language' ? 'Language' : preferenceOptionType === 'currency' ? 'Currency' : 'Timezone'}
                      </span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                )}
                {activeTab === "about-us" && (
                  <Button onClick={() => {
                    setEditingAboutUsContent(null);
                    setShowAboutUsModal(true);
                  }} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Content</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
                {activeTab === "signup-page" && (
                  <Button onClick={() => {
                    setEditingSignupPageContent(null);
                    setShowSignupPageModal(true);
                  }} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Add Content</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Search and Filters */}
            <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder={
                      activeTab === "faqs"
                        ? "Search FAQs..."
                        : activeTab === "resources"
                        ? "Search resources..."
                        : activeTab === "cities"
                        ? "Search cities..."
                        : activeTab === "pages"
                        ? "Search page content..."
                        : activeTab === "footer"
                        ? "Search footer links..."
                        : activeTab === "about-us"
                        ? "Search about us content..."
                        : "Search app links..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 backdrop-blur-xl bg-white/80 border border-white/40 text-gray-900 placeholder-gray-500 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                </div>
              {activeTab === "pages" && (
                <div className="flex flex-wrap gap-2">
                  <select
                    value={pageFilter}
                    onChange={(e) => setPageFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary focus:ring-primary min-w-[150px]"
                  >
                    <option value="">All Pages</option>
                    <optgroup label="Featured Pages">
                      <option value="become-a-partner">🌟 become-a-partner</option>
                      <option value="gift-card">🎁 gift-card</option>
                      <option value="about">📄 about</option>
                      <option value="help">📄 help</option>
                      <option value="why-beautonomi">📄 why-beautonomi</option>
                      <option value="beautonomi-friendly">📄 beautonomi-friendly</option>
                      <option value="against-discrimination">📄 against-discrimination</option>
                      <option value="release">📄 release</option>
                      <option value="pricing">📄 pricing</option>
                      <option value="signup">📄 signup</option>
                    </optgroup>
                    <optgroup label="Footer Pages">
                      <option value="privacy-policy">📄 privacy-policy</option>
                      <option value="terms-and-condition">📄 terms-and-condition</option>
                      <option value="terms-of-service">📄 terms-of-service</option>
                    </optgroup>
                    {pageSlugs.filter(slug => 
                      slug !== "become-a-partner" && 
                      slug !== "privacy-policy" && 
                      slug !== "terms-and-condition" && 
                      slug !== "terms-of-service" &&
                      slug !== "about" &&
                      slug !== "help"
                    ).length > 0 && (
                      <optgroup label="Other Pages">
                        {pageSlugs.filter(slug => 
                          slug !== "become-a-partner" && 
                          slug !== "privacy-policy" && 
                          slug !== "terms-and-condition" && 
                          slug !== "terms-of-service" &&
                          slug !== "about" &&
                          slug !== "help"
                        ).map((slug) => (
                          <option key={slug} value={slug}>
                            {slug}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {pageFilter !== "become-a-partner" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPageFilter("become-a-partner")}
                      className="whitespace-nowrap"
                    >
                      📝 Become a Partner
                    </Button>
                  )}
                  {!pageFilter.startsWith("privacy") && !pageFilter.startsWith("terms") && pageFilter !== "about" && pageFilter !== "help" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const footerPages = ["privacy-policy", "terms-and-condition", "terms-of-service", "about", "help"];
                        const firstFooterPage = footerPages.find(p => pageSlugs.includes(p)) || footerPages[0];
                        setPageFilter(firstFooterPage);
                      }}
                      className="whitespace-nowrap"
                    >
                      📄 Footer Pages
                    </Button>
                  )}
                </div>
              )}
              {activeTab === "footer" && (
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary focus:ring-primary min-w-[150px]"
                >
                  <option value="">All Sections</option>
                  {footerSections.map((section) => (
                    <option key={section} value={section}>
                      {section.charAt(0).toUpperCase() + section.slice(1)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <TabsContent value="faqs">
            {error ? (
              <EmptyState
                title="Failed to load FAQs"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredFAQs.length === 0 ? (
              <EmptyState
                title="No FAQs yet"
                description="Create your first FAQ"
                action={{
                  label: "Add FAQ",
                  onClick: () => setShowFAQModal(true),
                }}
              />
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredFAQs.map((faq) => (
                  <FAQCard
                    key={faq.id}
                    faq={faq}
                    onEdit={() => setEditingFAQ(faq)}
                    onDelete={() => handleDeleteFAQ(faq.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="resources">
            {error ? (
              <EmptyState
                title="Failed to load resources"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredResources.length === 0 ? (
              <EmptyState
                title="No resources yet"
                description="Create your first resource"
                action={{
                  label: "Add Resource",
                  onClick: () => setShowResourceModal(true),
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {filteredResources.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    onEdit={() => setEditingResource(resource)}
                    onDelete={() => handleDeleteResource(resource.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cities">
            {error ? (
              <EmptyState
                title="Failed to load cities"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredCities.length === 0 ? (
              <EmptyState
                title="No featured cities yet"
                description="Add your first featured city"
                action={{
                  label: "Add City",
                  onClick: () => setShowCityModal(true),
                }}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredCities.map((city) => (
                  <CityCard
                    key={city.id}
                    city={city}
                    onEdit={() => setEditingCity(city)}
                    onDelete={() => handleDeleteCity(city.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pages">
            {error ? (
              <EmptyState
                title="Failed to load page content"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredPages.length === 0 ? (
              <EmptyState
                title="No page content yet"
                description="Create your first page content"
                action={{
                  label: "Add Page Content",
                  onClick: () => setShowPageModal(true),
                }}
              />
            ) : (
              <div className="space-y-6">
                {(() => {
                  const footerPages = filteredPages.filter(p => 
                    p.page_slug === "privacy-policy" || 
                    p.page_slug === "terms-and-condition" || 
                    p.page_slug === "terms-of-service" ||
                    p.page_slug === "about" ||
                    p.page_slug === "help"
                  );
                  const otherPages = filteredPages.filter(p => 
                    p.page_slug !== "privacy-policy" && 
                    p.page_slug !== "terms-and-condition" && 
                    p.page_slug !== "terms-of-service" &&
                    p.page_slug !== "about" &&
                    p.page_slug !== "help"
                  );
                  
                  // If filtered, show all filtered pages
                  if (pageFilter) {
                    return (
                      <div className="space-y-3 sm:space-y-4">
                        {filteredPages.map((page) => (
                          <PageContentCard
                            key={page.id}
                            page={page}
                            onEdit={() => setEditingPage(page)}
                            onDelete={() => handleDeletePage(page.id)}
                          />
                        ))}
                      </div>
                    );
                  }
                  
                  // If not filtered, show grouped by footer pages and other pages
                  return (
                    <>
                      {footerPages.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                              📄 Footer Pages
                              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                                ({footerPages.length})
                              </span>
                            </h3>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const firstFooterPage = footerPages[0]?.page_slug || "privacy-policy";
                                setPageFilter(firstFooterPage);
                              }}
                              className="text-xs"
                            >
                              Filter Footer Pages
                            </Button>
                          </div>
                          <div className="space-y-3 sm:space-y-4">
                            {footerPages.map((page) => (
                              <PageContentCard
                                key={page.id}
                                page={page}
                                onEdit={() => setEditingPage(page)}
                                onDelete={() => handleDeletePage(page.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {otherPages.length > 0 && (
                        <div>
                          {footerPages.length > 0 && (
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                              Other Pages
                              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                                ({otherPages.length})
                              </span>
                            </h3>
                          )}
                          <div className="space-y-3 sm:space-y-4">
                            {otherPages.map((page) => (
                              <PageContentCard
                                key={page.id}
                                page={page}
                                onEdit={() => setEditingPage(page)}
                                onDelete={() => handleDeletePage(page.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          <TabsContent value="footer">
            {error ? (
              <EmptyState
                title="Failed to load footer links"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredFooterLinks.length === 0 ? (
              <EmptyState
                title="No footer links yet"
                description="Create your first footer link"
                action={{
                  label: "Add Footer Link",
                  onClick: () => setShowFooterModal(true),
                }}
              />
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredFooterLinks.map((link) => (
                  <FooterLinkCard
                    key={link.id}
                    link={link}
                    onEdit={() => {
                      setEditingFooterLink(link);
                      setShowFooterModal(true);
                    }}
                    onDelete={() => handleDeleteFooterLink(link.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile-questions">
            {error ? (
              <EmptyState
                title="Failed to load profile questions"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : profileQuestions.length === 0 ? (
              <EmptyState
                title="No profile questions yet"
                description="Create your first profile question"
                action={{
                  label: "Add Profile Question",
                  onClick: () => {
                    setEditingProfileQuestion(null);
                    setShowProfileQuestionModal(true);
                  },
                }}
              />
            ) : (
              <div className="space-y-4">
                {profileQuestions.map((question) => (
                  <ProfileQuestionCard
                    key={question.id}
                    question={question}
                    onEdit={() => {
                      setEditingProfileQuestion(question);
                      setShowProfileQuestionModal(true);
                    }}
                    onDelete={async (id) => {
                      if (confirm("Are you sure you want to delete this question?")) {
                        try {
                          await fetcher.delete(`/api/admin/content/profile-questions/${id}`);
                          toast.success("Question deleted");
                          loadData();
                        } catch {
                          toast.error("Failed to delete question");
                        }
                      }
                    }}
                    onToggleActive={async (id, isActive) => {
                      try {
                        await fetcher.put(`/api/admin/content/profile-questions/${id}`, { is_active: isActive });
                        toast.success(isActive ? "Question activated" : "Question deactivated");
                        loadData();
                      } catch {
                        toast.error("Failed to update question");
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="footer-settings">
            {error ? (
              <EmptyState
                title="Failed to load footer settings"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : footerSettings.length === 0 ? (
              <EmptyState
                title="No footer settings yet"
                description="Footer settings will appear here once created"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {footerSettings.map((setting) => (
                  <FooterSettingsCard
                    key={setting.id}
                    setting={setting}
                    onEdit={() => {
                      setEditingFooterSetting(setting);
                      setShowFooterSettingsModal(true);
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="social-media">
            {error ? (
              <EmptyState
                title="Failed to load social media links"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : socialMediaLinks.length === 0 ? (
              <EmptyState
                title="No social media links yet"
                description="Add your social media profiles to display in the footer"
                action={{
                  label: "Add Social Media Link",
                  onClick: () => {
                    setEditingSocialMediaLink(null);
                    setShowSocialMediaModal(true);
                  },
                }}
              />
            ) : (
              <div className="space-y-4">
                {socialMediaLinks
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((link) => (
                    <SocialMediaCard
                      key={link.id}
                      link={link}
                      onEdit={() => {
                        setEditingSocialMediaLink(link);
                        setShowSocialMediaModal(true);
                      }}
                      onDelete={async (id) => {
                        if (confirm("Are you sure you want to delete this social media link?")) {
                          try {
                            await fetcher.delete(`/api/admin/content/footer-links/${id}`);
                            toast.success("Social media link deleted");
                            loadData();
                          } catch {
                            toast.error("Failed to delete social media link");
                          }
                        }
                      }}
                    />
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="preference-options">
            {error ? (
              <EmptyState
                title="Failed to load preference options"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : preferenceOptions.length === 0 ? (
              <EmptyState
                title={`No ${preferenceOptionType}s yet`}
                description={`Add ${preferenceOptionType} options for users to select`}
                action={{
                  label: `Add ${preferenceOptionType === 'language' ? 'Language' : preferenceOptionType === 'currency' ? 'Currency' : 'Timezone'}`,
                  onClick: () => {
                    setEditingPreferenceOption(null);
                    setShowPreferenceOptionModal(true);
                  },
                }}
              />
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {preferenceOptions.map((option) => (
                  <PreferenceOptionCard
                    key={option.id}
                    option={option}
                    onEdit={() => {
                      setEditingPreferenceOption(option);
                      setShowPreferenceOptionModal(true);
                    }}
                    onDelete={async (id) => {
                      if (confirm(`Are you sure you want to delete this ${preferenceOptionType}?`)) {
                        try {
                          await fetcher.delete(`/api/admin/content/preference-options/${id}`);
                          toast.success(`${preferenceOptionType} deleted`);
                          loadData();
                        } catch {
                          toast.error(`Failed to delete ${preferenceOptionType}`);
                        }
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="about-us">
            {error ? (
              <EmptyState
                title="Failed to load about us content"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : filteredAboutUsContent.length === 0 ? (
              <EmptyState
                title="No about us content yet"
                description="Create your first about us content section"
                action={{
                  label: "Add About Us Content",
                  onClick: () => {
                    setEditingAboutUsContent(null);
                    setShowAboutUsModal(true);
                  },
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAboutUsContent.map((content) => (
                  <AboutUsCard
                    key={content.id}
                    content={content}
                    onEdit={() => {
                      setEditingAboutUsContent(content);
                      setShowAboutUsModal(true);
                    }}
                    onDelete={async (id) => {
                      if (confirm("Are you sure you want to delete this about us content?")) {
                        try {
                          await fetcher.delete(`/api/admin/content/about-us/${id}`);
                          toast.success("About us content deleted");
                          loadData();
                        } catch {
                          toast.error("Failed to delete about us content");
                        }
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="signup-page">
            {error ? (
              <EmptyState
                title="Failed to load signup page content"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : signupPageContent.length === 0 ? (
              <EmptyState
                title="No signup page content yet"
                description="Create your first signup page content section"
                action={{
                  label: "Add Signup Page Content",
                  onClick: () => {
                    setEditingSignupPageContent(null);
                    setShowSignupPageModal(true);
                  },
                }}
              />
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {signupPageContent
                  .sort((a, b) => a.order - b.order)
                  .map((content) => (
                    <SignupPageCard
                      key={content.id}
                      content={content}
                      onEdit={() => {
                        setEditingSignupPageContent(content);
                        setShowSignupPageModal(true);
                      }}
                      onDelete={async () => {
                        if (confirm("Are you sure you want to delete this content?")) {
                          try {
                            await fetcher.delete(`/api/admin/content/pages/${content.id}`);
                            toast.success("Content deleted");
                            loadData();
                          } catch {
                            toast.error("Failed to delete content");
                          }
                        }
                      }}
                    />
                  ))}
              </div>
            )}
          </TabsContent>
          </Tabs>
          </div>

          {/* Modals */}
          {showFAQModal && (
          <FAQModal
            faq={editingFAQ}
            onClose={() => {
              setShowFAQModal(false);
              setEditingFAQ(null);
            }}
            onSave={() => {
              setShowFAQModal(false);
              setEditingFAQ(null);
              loadData();
            }}
          />
          )}

          {showResourceModal && (
          <ResourceModal
            resource={editingResource}
            onClose={() => {
              setShowResourceModal(false);
              setEditingResource(null);
            }}
            onSave={() => {
              setShowResourceModal(false);
              setEditingResource(null);
              loadData();
            }}
          />
          )}

          {showCityModal && (
          <CityModal
            city={editingCity}
            onClose={() => {
              setShowCityModal(false);
              setEditingCity(null);
            }}
            onSave={() => {
              setShowCityModal(false);
              setEditingCity(null);
              loadData();
            }}
          />
          )}

          {showPageModal && (
          <PageContentModal
            page={editingPage}
            onClose={() => {
              setShowPageModal(false);
              setEditingPage(null);
            }}
            onSave={() => {
              setShowPageModal(false);
              setEditingPage(null);
              loadData();
            }}
          />
          )}

          {showFooterModal && (
          <FooterLinkModal
            link={editingFooterLink}
            onClose={() => {
              setShowFooterModal(false);
              setEditingFooterLink(null);
            }}
            onSave={() => {
              setShowFooterModal(false);
              setEditingFooterLink(null);
              loadData();
            }}
          />
          )}

          {showAppModal && (
          <AppLinkModal
            link={editingAppLink}
            onClose={() => {
              setShowAppModal(false);
              setEditingAppLink(null);
            }}
            onSave={() => {
              setShowAppModal(false);
              setEditingAppLink(null);
              loadData();
            }}
          />
          )}

          {showFooterSettingsModal && (
          <FooterSettingsModal
            setting={editingFooterSetting}
            isOpen={showFooterSettingsModal}
            onClose={() => {
              setShowFooterSettingsModal(false);
              setEditingFooterSetting(null);
            }}
            onSave={() => {
              setShowFooterSettingsModal(false);
              setEditingFooterSetting(null);
              loadData();
            }}
          />
          )}

          {showSocialMediaModal && (
          <SocialMediaModal
            link={editingSocialMediaLink}
            isOpen={showSocialMediaModal}
            onClose={() => {
              setShowSocialMediaModal(false);
              setEditingSocialMediaLink(null);
            }}
            onSave={() => {
              setShowSocialMediaModal(false);
              setEditingSocialMediaLink(null);
              loadData();
            }}
          />
          )}

          {showProfileQuestionModal && (
          <ProfileQuestionModal
            isOpen={showProfileQuestionModal}
            question={editingProfileQuestion}
            onClose={() => {
              setShowProfileQuestionModal(false);
              setEditingProfileQuestion(null);
            }}
            onSave={async (questionData) => {
              try {
                if (editingProfileQuestion) {
                  await fetcher.put(`/api/admin/content/profile-questions/${editingProfileQuestion.id}`, questionData);
                  toast.success("Question updated");
                } else {
                  await fetcher.post("/api/admin/content/profile-questions", questionData);
                  toast.success("Question created");
                }
                setShowProfileQuestionModal(false);
                setEditingProfileQuestion(null);
                loadData();
              } catch {
                toast.error("Failed to save question");
                throw error;
              }
            }}
          />
          )}

          {showPreferenceOptionModal && (
          <PreferenceOptionModal
            option={editingPreferenceOption}
            type={preferenceOptionType}
            isOpen={showPreferenceOptionModal}
            onClose={() => {
              setShowPreferenceOptionModal(false);
              setEditingPreferenceOption(null);
            }}
            onSave={() => {
              setShowPreferenceOptionModal(false);
              setEditingPreferenceOption(null);
              loadData();
            }}
          />
          )}

          {showAboutUsModal && (
          <AboutUsModal
            content={editingAboutUsContent}
            isOpen={showAboutUsModal}
            onClose={() => {
              setShowAboutUsModal(false);
              setEditingAboutUsContent(null);
            }}
            onSave={() => {
              setShowAboutUsModal(false);
              setEditingAboutUsContent(null);
              loadData();
            }}
          />
          )}

          {showSignupPageModal && (
          <SignupPageModal
            content={editingSignupPageContent}
            isOpen={showSignupPageModal}
            onClose={() => {
              setShowSignupPageModal(false);
              setEditingSignupPageContent(null);
            }}
            onSave={() => {
              setShowSignupPageModal(false);
              setEditingSignupPageContent(null);
              loadData();
            }}
          />
          )}
        </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}

function FAQCard({
  faq,
  onEdit,
  onDelete,
}: {
  faq: FAQ;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg mb-2 text-gray-900 dark:text-white">{faq.question}</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{faq.answer}</p>
        </div>
        <div className="flex gap-2 sm:ml-4 flex-shrink-0">
          <motion.button
            onClick={onEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors"
            aria-label="Edit FAQ"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete FAQ"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-gray-200">
        <span className="text-xs font-medium text-gray-700 capitalize">{faq.category}</span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${
            faq.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {faq.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </motion.div>
  );
}

function ResourceCard({
  resource,
  onEdit,
  onDelete,
}: {
  resource: Resource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg mb-2 text-gray-900 dark:text-white">{resource.title}</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">{resource.content}</p>
        </div>
        <div className="flex gap-2 sm:ml-4 flex-shrink-0">
          <motion.button
            onClick={onEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors"
            aria-label="Edit Resource"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete Resource"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-gray-200">
        <span className="text-xs font-medium text-gray-700 capitalize">{resource.type}</span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${
            resource.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {resource.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </motion.div>
  );
}

function CityCard({
  city,
  onEdit,
  onDelete,
}: {
  city: FeaturedCity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base sm:text-lg mb-1 text-gray-900 dark:text-white">
            {city.name}, {city.country}
          </h3>
          {city.description && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 leading-relaxed">{city.description}</p>
          )}
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {city.provider_count} provider{city.provider_count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 sm:ml-4 flex-shrink-0">
          <motion.button
            onClick={onEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors"
            aria-label="Edit City"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete City"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        </div>
      </div>
      <div className="pt-3 border-t border-gray-200">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${
            city.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {city.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </motion.div>
  );
}

function FAQModal({
  faq,
  onClose,
  onSave,
}: {
  faq: FAQ | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    question: faq?.question || "",
    answer: faq?.answer || "",
    category: faq?.category || "general",
    order: faq?.order || 0,
    is_active: faq?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (faq) {
        await fetcher.put(`/api/admin/content/faqs/${faq.id}`, formData);
        toast.success("FAQ updated");
      } else {
        await fetcher.post("/api/admin/content/faqs", formData);
        toast.success("FAQ created");
      }
      onSave();
    } catch {
      toast.error("Failed to save FAQ");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          {faq ? "Edit FAQ" : "Add FAQ"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="question" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">Question *</Label>
            <Input
              id="question"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              required
              className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary"
            />
          </div>
          <div>
            <Label htmlFor="answer" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">Answer *</Label>
            <textarea
              id="answer"
              value={formData.answer}
              onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary resize-y"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary"
              />
            </div>
            <div>
              <Label htmlFor="order" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">Display Order</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) =>
                  setFormData({ ...formData, order: parseInt(e.target.value) })
                }
                className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="w-4 h-4 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary"
            />
            <Label htmlFor="is_active" className="text-sm font-medium text-gray-900 dark:text-white">Active</Label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1 bg-primary hover:bg-primary/90 text-white shadow-md">
              {isSaving ? "Saving..." : faq ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResourceModal({
  resource,
  onClose,
  onSave,
}: {
  resource: Resource | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    title: resource?.title || "",
    content: resource?.content || "",
    type: resource?.type || "article",
    url: resource?.url || "",
    is_active: resource?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (resource) {
        await fetcher.put(`/api/admin/content/resources/${resource.id}`, formData);
        toast.success("Resource updated");
      } else {
        await fetcher.post("/api/admin/content/resources", formData);
        toast.success("Resource created");
      }
      onSave();
    } catch {
      toast.error("Failed to save resource");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {resource ? "Edit Resource" : "Add Resource"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="content">Content *</Label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[100px]"
              required
            />
          </div>
          <div>
            <Label htmlFor="type">Type *</Label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="article">Article</option>
              <option value="guide">Guide</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <Label htmlFor="url">URL (optional)</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : resource ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CityModal({
  city,
  onClose,
  onSave,
}: {
  city: FeaturedCity | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: city?.name || "",
    country: city?.country || "",
    image_url: city?.image_url || "",
    description: city?.description || "",
    is_active: city?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (city) {
        await fetcher.put(`/api/admin/content/featured-cities/${city.id}`, formData);
        toast.success("City updated");
      } else {
        await fetcher.post("/api/admin/content/featured-cities", formData);
        toast.success("City added");
      }
      onSave();
    } catch {
      toast.error("Failed to save city");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {city ? "Edit Featured City" : "Add Featured City"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">City Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full p-2 border rounded-md min-h-[100px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : city ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PageContentCard({
  page,
  onEdit,
  onDelete,
}: {
  page: PageContent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-base sm:text-lg text-gray-900 dark:text-white">{page.page_slug}</h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">/</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{page.section_key}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            Type: <span className="capitalize font-medium">{page.content_type}</span>
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
            {page.content.length > 200 ? `${page.content.substring(0, 200)}...` : page.content}
          </p>
        </div>
        <div className="flex gap-2 sm:ml-4 flex-shrink-0">
          <motion.button
            onClick={onEdit}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 rounded-lg transition-colors"
            aria-label="Edit Page"
          >
            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete Page"
          >
            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-gray-200">
        <span className="text-xs font-medium text-gray-700">Order: {page.order}</span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold w-fit ${
            page.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {page.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </motion.div>
  );
}

function PageContentModal({
  page,
  onClose,
  onSave,
}: {
  page: PageContent | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    page_slug: page?.page_slug || "",
    section_key: page?.section_key || "",
    content_type: page?.content_type || "text" as const,
    content: page?.content || "",
    metadata: page?.metadata || {},
    order: page?.order || 0,
    is_active: page?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [metadataJson, setMetadataJson] = useState(JSON.stringify(formData.metadata, null, 2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      
      // Parse metadata JSON
      let parsedMetadata = {};
      try {
        parsedMetadata = JSON.parse(metadataJson);
      } catch {
        toast.error("Invalid JSON in metadata field");
        return;
      }

      const payload = {
        ...formData,
        metadata: parsedMetadata,
      };

      if (page) {
        await fetcher.put(`/api/admin/content/pages/${page.id}`, payload);
        toast.success("Page content updated");
      } else {
        await fetcher.post("/api/admin/content/pages", payload);
        toast.success("Page content created");
      }
      onSave();
    } catch {
      toast.error("Failed to save page content");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {page ? "Edit Page Content" : "Add Page Content"}
        </h2>
        {(formData.page_slug === "become-a-partner" || 
          formData.page_slug === "gift-card" ||
          formData.page_slug === "privacy-policy" || 
          formData.page_slug === "terms-and-condition" || 
          formData.page_slug === "terms-of-service" ||
          formData.page_slug === "about" ||
          formData.page_slug === "help" ||
          formData.page_slug === "why-beautonomi" ||
          formData.page_slug === "beautonomi-friendly" ||
          formData.page_slug === "against-discrimination" ||
          formData.page_slug === "release" ||
          formData.page_slug === "pricing" ||
          formData.page_slug === "signup") && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>💡 Managing {formData.page_slug === "become-a-partner" ? "Become a Partner" : formData.page_slug === "gift-card" ? "Gift Card" : "Footer"} Page Content:</strong> Select <strong>HTML</strong> as the content type to use the rich text WYSIWYG editor. 
              {formData.page_slug === "become-a-partner" ? (
                <>
                  <br /><br />
                  <strong>Available Section Keys for Become a Partner page:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Main headline (e.g., "Everything you need to power your salon and spa")</li>
                    <li><code>hero_description</code> - Sub-headline below the title</li>
                    <li><code>rating_text</code> - Rating section text (e.g., "#1 highest-rated...")</li>
                    <li><code>why_different_title</code> - "Why We're Different" section title</li>
                    <li><code>why_different_description</code> - "Why We're Different" section description</li>
                    <li><code>features_title</code> - Features section title</li>
                    <li><code>features_description</code> - Features section description</li>
                    <li><code>features_list</code> - Features list (JSON format - see example below)</li>
                    <li><code>cta_title</code> - Call-to-action section title</li>
                    <li><code>cta_description</code> - Call-to-action section description</li>
                  </ul>
                  <br />
                  <strong>Features List JSON Format:</strong>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">{`[
  {
    "category": "SCHEDULING & PAYMENTS",
    "items": [
      {"name": "Calendar & Scheduling", "icon": "Calendar"},
      {"name": "Online Booking", "icon": "Calendar"}
    ]
  }
]`}</pre>
                </>
              ) : formData.page_slug === "gift-card" ? (
                <>
                  <br /><br />
                  <strong>Available Section Keys for Gift Card page:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Main headline (e.g., "Beautonomi gift cards")</li>
                    <li><code>hero_subtitle</code> - Sub-headline (e.g., "You give. They glow.")</li>
                    <li><code>hero_description</code> - Description text below subtitle</li>
                    <li><code>business_text</code> - Text before "Buy gift cards in bulk" link</li>
                    <li><code>banner_title</code> - Business banner title (e.g., "Gift cards for business")</li>
                    <li><code>banner_description</code> - Business banner description</li>
                    <li><code>banner_contact_text</code> - Contact text in banner</li>
                    <li><code>sales_email</code> - Sales email address</li>
                    <li><code>card_background_image</code> - Hero card background image URL (use "image" content type)</li>
                    <li><code>card_overlay_image</code> - Hero card overlay image URL (use "image" content type)</li>
                    <li><code>features_list</code> - Features array (JSON format - see example below)</li>
                    <li><code>designs_list</code> - Gift card design images array (JSON format - see example below)</li>
                    <li><code>picking_designs_title</code> - Title for "Pick your design" section</li>
                  </ul>
                  <br />
                  <strong>Features List JSON Format:</strong>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">{`[
  {
    "title": "Beautiful designs",
    "description": "Gift cards are customizable with your choice of design, message, and gift amount"
  },
  {
    "title": "Easy to send",
    "description": "Arrives within minutes via text or email and we'll confirm that it's been received"
  },
  {
    "title": "Never expires",
    "description": "Gift credit is available to use whenever they're ready to book beauty and wellness services"
  }
]`}</pre>
                  <br />
                  <strong>Designs List JSON Format (for image gallery):</strong>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">{`[
  {
    "image_url": "https://example.com/design1.jpg",
    "alt": "Design 1",
    "title": "Design 1"
  },
  {
    "image_url": "https://example.com/design2.jpg",
    "alt": "Design 2",
    "title": "Design 2"
  }
]`}</pre>
                  <p className="text-xs text-gray-600 mt-2">
                    💡 <strong>Image Management:</strong> Use "image" content type for single image URLs. Use "json" content type for arrays of images (designs_list). Images can be uploaded via Supabase Storage and URLs stored in CMS.
                  </p>
                </>
              ) : (
                <> 
                  <br /><br />
                  <strong>Available Section Keys for {formData.page_slug} page:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Main page title/headline</li>
                    <li><code>hero_content</code> - Main content section (use HTML for rich text)</li>
                    <li><code>sections</code> - Multiple sections (JSON format with array of {`{title, content}`} objects)</li>
                    <li><code>background_image_url</code> - Background image (use "image" content type)</li>
                  </ul>
                  <br />
                  <strong>Tip:</strong> Use <strong>HTML</strong> content type for rich text formatting with WYSIWYG editor. Use <strong>JSON</strong> for structured content like multiple sections. Use <strong>image</strong> content type for image URLs.
                </>
              )}
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="page_slug">Page Slug *</Label>
              <Select
                value={formData.page_slug || ""}
                onValueChange={(value) => setFormData({ ...formData, page_slug: value })}
              >
                <SelectTrigger id="page_slug" className="w-full">
                  <SelectValue placeholder="Select a page or type custom slug" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="become-a-partner">become-a-partner (Become a Partner page)</SelectItem>
                  <SelectItem value="gift-card">gift-card (Gift Card Marketing Page)</SelectItem>
                  <SelectItem value="home">home</SelectItem>
                  <SelectItem value="about">about (About Page)</SelectItem>
                  <SelectItem value="help">help (Help Center)</SelectItem>
                  <SelectItem value="career">career (Careers)</SelectItem>
                  <SelectItem value="why-beautonomi">why-beautonomi (Why Beautonomi)</SelectItem>
                  <SelectItem value="beautonomi-friendly">beautonomi-friendly (Beautonomi Friendly)</SelectItem>
                  <SelectItem value="against-discrimination">against-discrimination (Against Discrimination)</SelectItem>
                  <SelectItem value="release">release (Release Notes)</SelectItem>
                  <SelectItem value="pricing">pricing (Pricing)</SelectItem>
                  <SelectItem value="signup">signup (Signup Page)</SelectItem>
                  <SelectItem value="privacy-policy">privacy-policy (Privacy Policy - Footer Page)</SelectItem>
                  <SelectItem value="terms-and-condition">terms-and-condition (Terms & Conditions - Footer Page)</SelectItem>
                  <SelectItem value="terms-of-service">terms-of-service (Terms of Service - Footer Page)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="page_slug_custom"
                value={formData.page_slug}
                onChange={(e) => setFormData({ ...formData, page_slug: e.target.value })}
                placeholder="Or type custom page slug"
                className="mt-2"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Tip: Use "become-a-partner" to manage the Become a Partner page. Select HTML content type for rich text editing.
              </p>
            </div>
            <div>
              <Label htmlFor="section_key">Section Key *</Label>
              <Input
                id="section_key"
                value={formData.section_key}
                onChange={(e) => setFormData({ ...formData, section_key: e.target.value })}
                placeholder="e.g., hero_title, description, footer_text"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="content_type">Content Type *</Label>
              <select
                id="content_type"
                value={formData.content_type}
                onChange={(e) => setFormData({ ...formData, content_type: e.target.value as any })}
                className="w-full p-2 border rounded-md"
                required
              >
                <option value="text">Text</option>
                <option value="html">HTML</option>
                <option value="json">JSON</option>
                <option value="image">Image URL</option>
                <option value="video">Video URL</option>
              </select>
            </div>
            <div>
              <Label htmlFor="order">Display Order</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) =>
                  setFormData({ ...formData, order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="content">Content *</Label>
            {formData.content_type === "html" ? (
              <div className="mt-2">
                <WysiwygEditor
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  placeholder="Enter your HTML content here..."
                />
              </div>
            ) : (
              <textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full p-2 border rounded-md min-h-[150px] font-mono text-sm"
                required
              />
            )}
          </div>
          <div>
            <Label htmlFor="metadata">Metadata (JSON)</Label>
            <textarea
              id="metadata"
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              className="w-full p-2 border rounded-md min-h-[100px] font-mono text-sm"
              placeholder='{"key": "value"}'
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : page ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
