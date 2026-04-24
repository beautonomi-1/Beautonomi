"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import {
  CMS_PAGE_CONTENT_GROUP_LABELS,
  CMS_PAGE_CONTENT_GROUP_ORDER,
  CMS_PAGE_SECTION_PRESETS,
  cmsPageContentGroupForSlug,
  cmsPagePublicApiHint,
  cmsPageSlugTitle,
  cmsSectionPresetLabel,
} from "@/lib/cmsPageSectionPresets";

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
  image_url?: string | null;
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
    } catch (err: any) {
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
      (faq.question ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (faq.answer ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredResources = resources.filter((resource) =>
    (resource.title ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCities = cities.filter((city) =>
    (city.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPages = pages.filter((page) => {
    const q = searchQuery.toLowerCase();
    const meta = page.metadata as Record<string, unknown> | undefined;
    const metaTitle = String(meta?.title ?? "").toLowerCase();
    const preset = (cmsSectionPresetLabel(page.page_slug, page.section_key) ?? "").toLowerCase();
    const matchesSearch =
      (page.page_slug ?? "").toLowerCase().includes(q) ||
      (page.section_key ?? "").toLowerCase().includes(q) ||
      metaTitle.includes(q) ||
      preset.includes(q) ||
      (page.content ?? "").toLowerCase().includes(q);
    const matchesPageFilter = !pageFilter || page.page_slug === pageFilter;
    return matchesSearch && matchesPageFilter;
  });

  const filteredFooterLinks = footerLinks.filter((link) => {
    const matchesSearch =
      (link.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (link.href ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (link.section ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSectionFilter = !sectionFilter || link.section === sectionFilter;
    return matchesSearch && matchesSectionFilter;
  });

  const _filteredAppLinks = appLinks.filter((link) =>
    (link.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (link.href ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (link.platform ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  ); // reserved for app links filter UI

  const filteredAboutUsContent = aboutUsContent.filter((content) =>
    (content.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (content.content ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (content.section_key ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pageSlugSelectOptions = useMemo(() => {
    const fromData = pages.map((p) => p.page_slug);
    const fromPresets = Object.keys(CMS_PAGE_SECTION_PRESETS);
    return [...new Set([...fromPresets, ...fromData])].sort((a, b) => {
      const ga = cmsPageContentGroupForSlug(a);
      const gb = cmsPageContentGroupForSlug(b);
      const ia = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(ga);
      const ib = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(gb);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
  }, [pages]);

  const groupedPageContent = useMemo(() => {
    const slugMap = new Map<string, PageContent[]>();
    for (const p of filteredPages) {
      if (!slugMap.has(p.page_slug)) slugMap.set(p.page_slug, []);
      slugMap.get(p.page_slug)!.push(p);
    }
    for (const list of slugMap.values()) {
      list.sort((a, b) => {
        const oa = Number(a.order) || 0;
        const ob = Number(b.order) || 0;
        if (oa !== ob) return oa - ob;
        return (a.section_key || "").localeCompare(b.section_key || "");
      });
    }
    const slugs = [...slugMap.keys()].sort((a, b) => {
      const ga = cmsPageContentGroupForSlug(a);
      const gb = cmsPageContentGroupForSlug(b);
      const ia = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(ga);
      const ib = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(gb);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    type GroupId = (typeof CMS_PAGE_CONTENT_GROUP_ORDER)[number];
    const out: { group: GroupId; panels: { slug: string; rows: PageContent[] }[] }[] = [];
    for (const gid of CMS_PAGE_CONTENT_GROUP_ORDER) {
      const panels = slugs
        .filter((s) => cmsPageContentGroupForSlug(s) === gid)
        .map((slug) => ({ slug, rows: slugMap.get(slug)! }));
      if (panels.length) out.push({ group: gid, panels });
    }
    return out;
  }, [filteredPages]);
  
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
                    <TabsTrigger value="faqs" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">FAQs</span>
                    <span className="sm:hidden">FAQ</span>
                  </TabsTrigger>
                    <TabsTrigger value="resources" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Resources</span>
                      <span className="sm:hidden">Res</span>
                    </TabsTrigger>
                    <TabsTrigger value="cities" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Cities</span>
                      <span className="sm:hidden">City</span>
                    </TabsTrigger>
                    <TabsTrigger value="pages" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Pages
                    </TabsTrigger>
                    <TabsTrigger value="footer" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Footer</span>
                      <span className="sm:hidden">Foot</span>
                    </TabsTrigger>
                    <TabsTrigger value="apps" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Apps
                    </TabsTrigger>
                    <TabsTrigger value="profile-questions" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Profile Questions</span>
                      <span className="lg:hidden">Profile</span>
                    </TabsTrigger>
                    <TabsTrigger value="footer-settings" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Footer Settings</span>
                      <span className="lg:hidden">Footer</span>
                    </TabsTrigger>
                    <TabsTrigger value="social-media" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Social Media</span>
                      <span className="lg:hidden">Social</span>
                    </TabsTrigger>
                    <TabsTrigger value="preference-options" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                      <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden lg:inline">Preferences</span>
                      <span className="lg:hidden">Prefs</span>
                    </TabsTrigger>
                    <TabsTrigger value="about-us" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">About Us</span>
                    <span className="sm:hidden">About</span>
                  </TabsTrigger>
                    <TabsTrigger value="signup-page" className="text-xs sm:text-sm px-2 sm:px-3 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary-hover data-[state=active]:text-white data-[state=active]:shadow-md rounded-lg transition-all">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden lg:inline">Signup Page</span>
                    <span className="lg:hidden">Signup</span>
                  </TabsTrigger>
                </TabsList>
              </div>
                <div className="flex-shrink-0">
                  {activeTab === "faqs" && (
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button onClick={() => setShowFAQModal(true)} className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white shadow-lg">
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
                        ? "Search slug, section, preset label, title, or body…"
                        : activeTab === "footer"
                        ? "Search footer links..."
                        : activeTab === "about-us"
                        ? "Search about us content..."
                        : "Search app links..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 backdrop-blur-xl bg-white/80 border border-white/40 text-gray-900 placeholder-gray-500 focus:border-primary focus:ring-primary rounded-xl"
                  />
                </div>
              {activeTab === "pages" && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pageFilter}
                    onChange={(e) => setPageFilter(e.target.value)}
                    className="min-w-[200px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:ring-primary dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">All page slugs</option>
                    {CMS_PAGE_CONTENT_GROUP_ORDER.map((gid) => {
                      const slugs = pageSlugSelectOptions.filter((s) => cmsPageContentGroupForSlug(s) === gid);
                      if (!slugs.length) return null;
                      return (
                        <optgroup key={gid} label={CMS_PAGE_CONTENT_GROUP_LABELS[gid]}>
                          {slugs.map((slug) => (
                            <option key={slug} value={slug}>
                              {cmsPageSlugTitle(slug)} ({slug})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {pageFilter ? (
                    <Button type="button" variant="outline" className="whitespace-nowrap" onClick={() => setPageFilter("")}>
                      Clear page filter
                    </Button>
                  ) : null}
                  {pageFilter !== "become-a-partner" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPageFilter("become-a-partner")}
                      className="whitespace-nowrap"
                    >
                      Become a partner
                    </Button>
                  ) : null}
                  {(() => {
                    const legalSlugs = [
                      "privacy-policy",
                      "terms-and-condition",
                      "terms-of-service",
                      "cookie-policy",
                    ];
                    const firstLegal = legalSlugs.find((s) => pageSlugSelectOptions.includes(s));
                    const onLegal = legalSlugs.includes(pageFilter);
                    if (!firstLegal || onLegal) return null;
                    return (
                      <Button type="button" variant="outline" className="whitespace-nowrap" onClick={() => setPageFilter(firstLegal)}>
                        Legal & policy
                      </Button>
                    );
                  })()}
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
            ) : pages.length === 0 ? (
              <EmptyState
                title="No page content yet"
                description="Create your first page content"
                action={{
                  label: "Add Page Content",
                  onClick: () => setShowPageModal(true),
                }}
              />
            ) : filteredPages.length === 0 ? (
              <EmptyState
                title="No matching sections"
                description="Try another search, clear the page slug filter, or add a missing section."
                action={{
                  label: "Clear filters",
                  onClick: () => {
                    setSearchQuery("");
                    setPageFilter("");
                  },
                }}
              />
            ) : (
              <div className="space-y-10">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sections are grouped by site area, then by page slug. Within each page, blocks follow display order.
                </p>
                {groupedPageContent.map(({ group, panels }) => (
                  <section key={group} className="space-y-4">
                    <h2 className="border-b border-gray-200 pb-2 text-base font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
                      {CMS_PAGE_CONTENT_GROUP_LABELS[group]}
                    </h2>
                    <div className="space-y-6">
                      {panels.map(({ slug, rows }) => {
                        const apiHint = cmsPagePublicApiHint(slug);
                        return (
                          <div
                            key={slug}
                            className="rounded-xl border border-gray-200/80 bg-white/70 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
                          >
                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {cmsPageSlugTitle(slug)}
                                </h3>
                                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{slug}</p>
                                {apiHint ? (
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Public: <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{apiHint}</code>
                                  </p>
                                ) : null}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {rows.length} section{rows.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="space-y-3 sm:space-y-4">
                              {rows.map((page) => (
                                <PageContentCard
                                  key={page.id}
                                  page={page}
                                  onEdit={() => setEditingPage(page)}
                                  onDelete={() => handleDeletePage(page.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
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
            className="p-2 text-gray-600 hover:text-primary hover:bg-pink-50 rounded-lg transition-colors"
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
            className="p-2 text-gray-600 hover:text-primary hover:bg-pink-50 rounded-lg transition-colors"
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
            className="p-2 text-gray-600 hover:text-primary hover:bg-pink-50 rounded-lg transition-colors"
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
            className="p-2 text-gray-600 hover:text-primary hover:bg-pink-50 rounded-lg transition-colors"
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
          formData.page_slug === "cookie-policy" ||
          formData.page_slug === "about" ||
          formData.page_slug === "help" ||
          formData.page_slug === "career" ||
          formData.page_slug === "why-beautonomi" ||
          formData.page_slug === "beautonomi-friendly" ||
          formData.page_slug === "release" ||
          formData.page_slug === "pricing" ||
          formData.page_slug === "signup" ||
          formData.page_slug === "resources") && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>💡 Managing {formData.page_slug === "become-a-partner" ? "Become a Partner" : formData.page_slug === "gift-card" ? "Gift Card" : formData.page_slug === "resources" ? "Resources" : "Footer"} Page Content:</strong> Select <strong>HTML</strong> as the content type to use the rich text WYSIWYG editor. 
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
                    <li><code>video_tour_url</code> - Video tour URL (YouTube or Vimeo). When set, &quot;Watch a video tour&quot; opens an in-context popup modal with the video. Use content type <strong>text</strong> or <strong>video</strong>.</li>
                    <li><code>demo_booking_type</code> - Demo booking provider: <code>calendly</code> or <code>zoho</code>. Use content type <strong>text</strong>.</li>
                    <li><code>demo_booking_embed</code> - For Calendly: your Calendly scheduling URL (e.g. <code>https://calendly.com/yourname/demo</code>). For Zoho: same URL, or paste the full iframe HTML. Use content type <strong>text</strong> or <strong>html</strong>. When set, &quot;Book a demo&quot; opens an in-page embed modal.</li>
                    <li><code>top_banner_enabled</code> - Set to <code>true</code>, <code>1</code>, or <code>yes</code> to show the notification strip at the top of the page. Omit or set to anything else to hide it. Use content type <strong>text</strong>.</li>
                    <li><code>top_banner_content</code> - (Optional) Custom message for the top strip. If empty, the default &quot;Introducing Beautonomi Connect...&quot; is used. Use content type <strong>text</strong>.</li>
                    <li><code>top_banner_link</code> - (Optional) URL for the &quot;Learn more&quot; link in the strip. Default is <code>/resources</code>. Use content type <strong>text</strong>.</li>
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
              ) : formData.page_slug === "privacy-policy" ? (
                <>
                  <br /><br />
                  <strong>Section keys for /privacy-policy (must match the live page):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Main H1 headline (text or HTML)</li>
                    <li><code>hero_description</code> - Body under &quot;Privacy Policy&quot; card (use <strong>HTML</strong> for rich text)</li>
                    <li><code>hero_image</code> - Hero image URL (content type <strong>image</strong> or text URL)</li>
                    <li><code>supplemental_policies</code> - JSON array: <code>[{`{"title":"...","link":"/path"}`}]</code></li>
                    <li><code>related_articles</code> - JSON array: <code>[{`{"category":"...","title":"...","description":"...","link":"/path"}`}]</code> (category optional)</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    The public page loads <code>GET /api/public/content/pages/privacy-policy</code>. Only rows with <strong>is_active</strong> are returned. The sidebar <strong>Contact us</strong> button always goes to <code>/help</code> (platform support), not account messages.
                  </p>
                </>
              ) : formData.page_slug === "terms-and-condition" ? (
                <>
                  <br /><br />
                  <strong>Section keys for /terms-and-condition (must match the live page):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>page_title</code> or <code>hero_title</code> - Main H1 headline</li>
                    <li><code>hero_image</code> - Hero image URL (optional; same pattern as privacy)</li>
                    <li><code>intro_heading</code> - Title above the intro block (default: &quot;Applicability of Terms&quot;)</li>
                    <li><code>intro</code> - Opening copy (HTML). Aliases: <code>hero_description</code>, <code>hero_content</code></li>
                    <li><code>sections</code> - JSON array of objects <code>{`{"title":"...","content":"... (HTML OK)"}`}</code></li>
                    <li><code>sidebar_heading</code> / <code>sidebar_description</code> - Sticky sidebar copy</li>
                    <li><code>supplemental_policies</code> / <code>related_articles</code> - Same JSON shapes as privacy (optional; sections hidden if empty)</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    Public API: <code>GET /api/public/content/pages/terms-and-condition</code>. The sidebar <strong>Contact us</strong> button always goes to <code>/help</code>.
                  </p>
                </>
              ) : formData.page_slug === "cookie-policy" ? (
                <>
                  <br /><br />
                  <strong>Section keys for /cookie-policy (must match the live page):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>page_title</code> or <code>hero_title</code> - Main H1 headline</li>
                    <li><code>hero_image</code> - Hero image URL (optional)</li>
                    <li><code>intro_heading</code> - Title above the intro block</li>
                    <li><code>intro</code> - Opening copy (HTML). Aliases: <code>hero_description</code>, <code>hero_content</code></li>
                    <li><code>sections</code> - JSON array of objects <code>{`{"title":"...","content":"... (HTML OK)"}`}</code></li>
                    <li><code>sidebar_heading</code> / <code>sidebar_description</code> - Sticky sidebar copy</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    Public API: <code>GET /api/public/content/pages/cookie-policy</code>.
                  </p>
                </>
              ) : formData.page_slug === "help" ? (
                <>
                  <br /><br />
                  <strong>Section keys for /help (Help Centre):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Main headline (default: &quot;Hi, how can we help?&quot;)</li>
                    <li><code>search_placeholder</code> - Search input placeholder</li>
                    <li><code>search_suggestions</code> - JSON array of strings shown under &quot;Top articles&quot;</li>
                    <li><code>cta_heading</code> - Support strip title</li>
                    <li><code>cta_body_guest</code> - Copy when the visitor is logged out (desktop)</li>
                    <li><code>cta_body_authenticated</code> - Copy when logged in (desktop)</li>
                    <li><code>cta_mobile_hint_guest</code> - Short line above the login button on small screens</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    Public API: <code>GET /api/public/page-content?page_slug=help</code>
                  </p>
                </>
              ) : formData.page_slug === "resources" ? (
                <>
                  <br /><br />
                  <strong>/resources page:</strong> The live page loads <code>GET /api/public/page-content?page_slug=resources</code> and renders <strong>every active row</strong> for this slug in <strong>display order</strong>. You can use any <code>section_key</code> names; each block is shown as HTML or plain text depending on content type.
                </>
              ) : formData.page_slug === "career" ? (
                <>
                  <br /><br />
                  <strong>Section keys for <code>/career</code> (Careers marketing + Zoho Recruit):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>careers_portal_url</code> - HTTPS URL for open roles (e.g. Zoho Career Site). Used for CTAs and redirects from <code>/career/positions</code>. Host must be <code>*.zohorecruit.com</code>. Content type <strong>text</strong>.</li>
                    <li><code>meta_title</code> - Browser / SEO title (text).</li>
                    <li><code>meta_description</code> - SEO description; keep short (text).</li>
                    <li><code>hero_eyebrow</code> - Short line above headline, e.g. &quot;We&apos;re hiring&quot; (text).</li>
                    <li><code>hero_title</code> - Main headline (text).</li>
                    <li><code>hero_subtitle</code> - One scannable sentence; UI truncates very long text (text).</li>
                    <li><code>hero_cta_label</code> - Primary button label, e.g. &quot;View open roles&quot; (text).</li>
                    <li><code>value_cards</code> - JSON array of <code>{`{ "title", "blurb", "image_url?", "cta_label?" }`}</code> (3–4 cards). Keep blurbs brief.</li>
                    <li><code>highlight_cards</code> - Optional JSON array of small cards: <code>{`{ "title", "blurb" }`}</code> (2–3 items).</li>
                    <li><code>carousel_slides</code> - Optional JSON: <code>{`[{ "image_url", "alt" }]`}</code> for the image strip; use Supabase public URLs or other hosts allowed for Next.js images.</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    Public API: <code>GET /api/public/pages/career</code>. Job search and apply on the site redirect to <code>careers_portal_url</code> when valid.
                  </p>
                  <br />
                  <strong>value_cards JSON example:</strong>
                  <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">{`[
  { "title": "Flexibility", "blurb": "Work in the way that fits your life.", "image_url": "https://...", "cta_label": "See roles" },
  { "title": "Belonging", "blurb": "Bring your whole self. We grow together." }
]`}</pre>
                </>
              ) : formData.page_slug === "beautonomi-friendly" ? (
                <>
                  <br /><br />
                  <strong>Section keys for /beautonomi-friendly (hero only; carousel blocks are still static):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><code>hero_title</code> - Lines for the H1, separated by <strong>newlines</strong> (default: three lines &quot;Introducing&quot;, &quot;Beautonomi-friendly&quot;, &quot;apartments&quot;)</li>
                    <li><code>hero_subtitle</code> - Subheading under the title</li>
                    <li><code>cta_label</code> - Primary button label</li>
                    <li><code>cta_href</code> - Primary button link (default <code>/explore</code>)</li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">
                    Public API: <code>GET /api/public/page-content?page_slug=beautonomi-friendly</code>
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
                  <SelectItem value="resources">resources (/resources)</SelectItem>
                  <SelectItem value="about">about (About Page)</SelectItem>
                  <SelectItem value="help">help (Help Center)</SelectItem>
                  <SelectItem value="career">career (Careers)</SelectItem>
                  <SelectItem value="why-beautonomi">why-beautonomi (Why Beautonomi)</SelectItem>
                  <SelectItem value="beautonomi-friendly">beautonomi-friendly (Beautonomi Friendly)</SelectItem>
                  <SelectItem value="release">release (Release Notes)</SelectItem>
                  <SelectItem value="pricing">pricing (Pricing)</SelectItem>
                  <SelectItem value="signup">signup (Signup Page)</SelectItem>
                  <SelectItem value="privacy-policy">privacy-policy (Privacy Policy - Footer Page)</SelectItem>
                  <SelectItem value="terms-and-condition">terms-and-condition (Terms & Conditions - Footer Page)</SelectItem>
                  <SelectItem value="terms-of-service">terms-of-service (Terms of Service - Footer Page)</SelectItem>
                  <SelectItem value="cookie-policy">cookie-policy (Cookie Policy - Footer Page)</SelectItem>
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
