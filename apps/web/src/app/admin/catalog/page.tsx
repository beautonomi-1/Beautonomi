"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Tag,
  HelpCircle,
  Sparkles,
  Upload,
  Image as ImageIcon,
  X,
  Scissors,
  Heart,
  Star,
  Gem,
  Palette,
  Wand2,
  Sparkle,
  Flower2,
  Droplet,
  Brush,
  SprayCan,
  Smile,
  Heart as HandHeart,
  Eye,
  User,
  Users,
  Store,
  Home,
  MapPin,
  Calendar,
  Clock,
  Package,
  Gift,
  Award,
  Crown,
  Zap,
  Flame,
  // Hair & Styling (including African hairstyles)
  Waves,
  Layers,
  Grid3x3,
  GitBranch,
  GitMerge,
  // Spa & Wellness
  Leaf,
  Droplets,
  Wind,
  Sun,
  Moon,
  Activity,
  Brain,
  HeartPulse,
  // Nails
  Hand,
  Fingerprint,
  // Wellness
  Apple,
  Carrot,
  Coffee,
  Utensils,
  // Tools
  Wrench,
  Hammer,
  // Shapes & Design
  Circle,
  Hexagon,
  Octagon,
  Pentagon,
  Square,
  Triangle,
  Diamond,
  Shirt,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface GlobalCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  display_order: number;
  is_featured: boolean;
  is_active: boolean;
  provider_count?: number;
}

export default function AdminCatalog() {
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGlobalCategoryModal, setShowGlobalCategoryModal] = useState(false);
  const [editingGlobalCategory, setEditingGlobalCategory] = useState<GlobalCategory | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: GlobalCategory[]; error: null }>(
        "/api/admin/catalog/global-categories"
      );
      setGlobalCategories(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load data";
      setError(errorMessage);
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteGlobalCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this global category?")) return;

    try {
      await fetcher.delete(`/api/admin/catalog/global-categories/${id}`);
      toast.success("Global category deleted");
      loadData();
    } catch {
      toast.error("Failed to delete global category");
    }
  };

  const filteredGlobalCategories = globalCategories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading catalog..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Catalog Management</h1>
            <p className="text-gray-600">Manage global service categories</p>
          </div>
        </div>

        {/* Search and Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search global categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setShowGlobalCategoryModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Global Category
          </Button>
        </div>

        {/* Global Categories List */}
        {error ? (
          <EmptyState
            title="Failed to load global categories"
            description={error}
            action={{
              label: "Retry",
              onClick: loadData,
            }}
          />
        ) : filteredGlobalCategories.length === 0 ? (
          <EmptyState
            title="No global categories yet"
            description="Create your first global category for the home page"
            action={{
              label: "Add Global Category",
              onClick: () => setShowGlobalCategoryModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGlobalCategories.map((category) => (
              <GlobalCategoryCard
                key={category.id}
                category={category}
                onEdit={() => setEditingGlobalCategory(category)}
                onDelete={() => handleDeleteGlobalCategory(category.id)}
              />
            ))}
          </div>
        )}

        {/* Modal */}
        {showGlobalCategoryModal && (
          <GlobalCategoryModal
            category={editingGlobalCategory}
            onClose={() => {
              setShowGlobalCategoryModal(false);
              setEditingGlobalCategory(null);
            }}
            onSave={() => {
              setShowGlobalCategoryModal(false);
              setEditingGlobalCategory(null);
              loadData();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

// Comprehensive beauty and wellness icons from Lucide
const BEAUTY_ICONS = [
  // Hair & Styling (including African hairstyles - using GitBranch/GitMerge for braids/twists)
  { name: "Scissors", icon: Scissors, category: "Hair" },
  { name: "Waves", icon: Waves, category: "Hair" },
  { name: "Layers", icon: Layers, category: "Hair" },
  { name: "Braids", icon: GitBranch, category: "Hair" }, // GitBranch represents braids
  { name: "Twists", icon: GitMerge, category: "Hair" }, // GitMerge represents twists
  { name: "Grid3x3", icon: Grid3x3, category: "Hair" },
  
  // Makeup & Cosmetics
  { name: "Palette", icon: Palette, category: "Makeup" },
  { name: "Brush", icon: Brush, category: "Makeup" },
  { name: "SprayCan", icon: SprayCan, category: "Makeup" },
  { name: "Wand2", icon: Wand2, category: "Makeup" },
  { name: "Sparkle", icon: Sparkle, category: "Makeup" },
  
  // Nails
  { name: "Hand", icon: Hand, category: "Nails" },
  { name: "Fingerprint", icon: Fingerprint, category: "Nails" },
  { name: "HandHeart", icon: HandHeart, category: "Nails" },
  
  // Spa & Wellness
  { name: "Leaf", icon: Leaf, category: "Spa" },
  { name: "Droplets", icon: Droplets, category: "Spa" },
  { name: "Wind", icon: Wind, category: "Spa" },
  { name: "Sun", icon: Sun, category: "Spa" },
  { name: "Moon", icon: Moon, category: "Spa" },
  { name: "Activity", icon: Activity, category: "Spa" },
  { name: "HeartPulse", icon: HeartPulse, category: "Spa" },
  
  // Massage & Therapy
  { name: "Brain", icon: Brain, category: "Massage" },
  { name: "Heart", icon: Heart, category: "Massage" },
  
  // Skincare & Facial
  { name: "Droplet", icon: Droplet, category: "Skincare" },
  { name: "Eye", icon: Eye, category: "Skincare" },
  { name: "Smile", icon: Smile, category: "Skincare" },
  { name: "Flower2", icon: Flower2, category: "Skincare" },
  { name: "Gem", icon: Gem, category: "Skincare" },
  { name: "Diamond", icon: Diamond, category: "Skincare" },
  { name: "Star", icon: Star, category: "Skincare" },
  { name: "Crown", icon: Crown, category: "Skincare" },
  
  // Wellness & Health
  { name: "Apple", icon: Apple, category: "Wellness" },
  { name: "Carrot", icon: Carrot, category: "Wellness" },
  { name: "Coffee", icon: Coffee, category: "Wellness" },
  { name: "Utensils", icon: Utensils, category: "Wellness" },
  
  // Tools & Equipment
  { name: "Wrench", icon: Wrench, category: "Tools" },
  { name: "Hammer", icon: Hammer, category: "Tools" },
  
  // Shapes & Design
  { name: "Circle", icon: Circle, category: "Design" },
  { name: "Square", icon: Square, category: "Design" },
  { name: "Triangle", icon: Triangle, category: "Design" },
  { name: "Hexagon", icon: Hexagon, category: "Design" },
  { name: "Octagon", icon: Octagon, category: "Design" },
  { name: "Pentagon", icon: Pentagon, category: "Design" },
  
  // General
  { name: "User", icon: User, category: "General" },
  { name: "Users", icon: Users, category: "General" },
  { name: "Store", icon: Store, category: "General" },
  { name: "Home", icon: Home, category: "General" },
  { name: "MapPin", icon: MapPin, category: "General" },
  { name: "Gift", icon: Gift, category: "General" },
  { name: "Award", icon: Award, category: "General" },
  { name: "Tag", icon: Tag, category: "General" },
  { name: "Zap", icon: Zap, category: "General" },
  { name: "Flame", icon: Flame, category: "General" },
  { name: "Package", icon: Package, category: "General" },
  { name: "Calendar", icon: Calendar, category: "General" },
  { name: "Clock", icon: Clock, category: "General" },
  { name: "Shirt", icon: Shirt, category: "General" },
] as const;

// Helper to get icon component by name
function getIconByName(iconName: string | null | undefined) {
  if (!iconName) return null;
  const iconEntry = BEAUTY_ICONS.find((item) => item.name === iconName);
  return iconEntry ? iconEntry.icon : null;
}

function GlobalCategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: GlobalCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg w-10 h-10 flex items-center justify-center">
            {(() => {
              // Check if icon is an image URL
              if (category.icon && (category.icon.startsWith("http") || category.icon.startsWith("data:"))) {
                return (
                  <img
                    src={category.icon}
                    alt={category.name}
                    className="w-6 h-6 object-contain"
                  />
                );
              }
              // Otherwise, try to render as Lucide icon
              const IconComponent = getIconByName(category.icon);
              return IconComponent ? (
                <IconComponent className="w-5 h-5 text-purple-600" />
              ) : (
                <Tag className="w-5 h-5 text-purple-600" />
              );
            })()}
          </div>
          <div>
            <h3 className="font-semibold text-lg">{category.name}</h3>
            <p className="text-sm text-gray-600">{category.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {category.description && (
        <p className="text-sm text-gray-600 mb-4">{category.description}</p>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              category.is_active
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {category.is_active ? "Active" : "Inactive"}
          </span>
          {category.is_featured && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              Featured
            </span>
          )}
        </div>
        {category.provider_count !== undefined && (
          <span className="text-sm text-gray-600">
            {category.provider_count} provider{category.provider_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

function GlobalCategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: GlobalCategory | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: category?.name || "",
    slug: category?.slug || "",
    description: category?.description || "",
    icon: category?.icon || "",
    display_order: category?.display_order || 0,
    is_featured: category?.is_featured ?? false,
    is_active: category?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [selectedIconCategory, setSelectedIconCategory] = useState<string>("All");
  const [iconType, setIconType] = useState<"icon" | "image">(() => {
    // Detect if existing icon is a URL (image) or icon name
    if (category?.icon && (category.icon.startsWith("http") || category.icon.startsWith("data:"))) {
      return "image";
    }
    return "icon";
  });
  const [imagePreview, setImagePreview] = useState<string | null>(
    category?.icon && (category.icon.startsWith("http") || category.icon.startsWith("data:")) 
      ? category.icon 
      : null
  );

  // Auto-generate slug from name when name changes (unless slug was manually edited)
  useEffect(() => {
    if (!category && !slugManuallyEdited && formData.name) {
      const generatedSlug = generateSlug(formData.name);
      setFormData((prev) => ({ ...prev, slug: generatedSlug }));
      setSlugError(null);
    }
  }, [formData.name, category, slugManuallyEdited]);

  // Validate slug format
  const validateSlug = (slug: string): string | null => {
    if (!slug) {
      return "Slug is required";
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return "Slug must contain only lowercase letters, numbers, and hyphens";
    }
    if (slug.startsWith("-") || slug.endsWith("-")) {
      return "Slug cannot start or end with a hyphen";
    }
    return null;
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({ ...prev, name }));
    if (!slugManuallyEdited && !category) {
      const generatedSlug = generateSlug(name);
      setFormData((prev) => ({ ...prev, slug: generatedSlug }));
    }
  };

  const handleSlugChange = (slug: string) => {
    setSlugManuallyEdited(true);
    const error = validateSlug(slug);
    setSlugError(error);
    setFormData((prev) => ({ ...prev, slug }));
  };

  const handleIconSelect = (iconName: string) => {
    setFormData((prev) => ({ ...prev, icon: iconName }));
    setShowIconPicker(false);
    setIconSearch("");
    setIconType("icon");
    setImagePreview(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image size must be less than 2MB");
      return;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setFormData((prev) => ({ ...prev, icon: dataUrl }));
      setIconType("image");
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlChange = (url: string) => {
    setFormData((prev) => ({ ...prev, icon: url }));
    setImagePreview(url);
    setIconType("image");
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, icon: "" }));
  };

  // Check if icon is a URL/image
  const isImageUrl = (icon: string | undefined) => {
    return icon ? (icon.startsWith("http") || icon.startsWith("data:")) : false;
  };

  // Get unique categories
  const iconCategories = ["All", ...Array.from(new Set(BEAUTY_ICONS.map(item => item.category)))];
  
  const filteredIcons = BEAUTY_ICONS.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(iconSearch.toLowerCase());
    const matchesCategory = selectedIconCategory === "All" || item.category === selectedIconCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate slug before submitting
    const slugValidationError = validateSlug(formData.slug);
    if (slugValidationError) {
      setSlugError(slugValidationError);
      toast.error(slugValidationError);
      return;
    }

    try {
      setIsSaving(true);
      setSlugError(null);
      
      if (category) {
        await fetcher.put(`/api/admin/catalog/global-categories/${category.id}`, formData);
        toast.success("Global category updated");
      } else {
        await fetcher.post("/api/admin/catalog/global-categories", formData);
        toast.success("Global category created");
      }
      onSave();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError 
        ? error.message 
        : error?.response?.data?.error || "Failed to save global category";
      toast.error(errorMessage);
      console.error("Error saving category:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {category ? "Edit Global Category" : "Add Global Category"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="gc_name" className="flex items-center gap-2">
              Category Name *
            </Label>
            <Input
              id="gc_name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder="e.g., Hair & Styling"
            />
            <p className="text-xs text-gray-500 mt-1">
              The display name for this category
            </p>
          </div>
          
          <div>
            <Label htmlFor="gc_slug" className="flex items-center gap-2">
              Slug *
              <div className="group relative">
                <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  A slug is a URL-friendly version of the name. It&apos;s used in web addresses (e.g., &quot;hair-styling&quot; becomes /category/hair-styling). Only lowercase letters, numbers, and hyphens are allowed.
                </div>
              </div>
            </Label>
            <Input
              id="gc_slug"
              value={formData.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              placeholder="e.g., hair-styling"
              className={slugError ? "border-red-500" : ""}
            />
            {slugError ? (
              <p className="text-xs text-red-500 mt-1">{slugError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Auto-generated from name. You can edit it manually. Only lowercase letters, numbers, and hyphens.
              </p>
            )}
          </div>
          
          <div>
            <Label htmlFor="gc_icon" className="flex items-center gap-2">
              Icon / Image
              <Sparkles className="w-4 h-4 text-gray-400" />
            </Label>
            
            {/* Toggle between Icon and Image */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setIconType("icon");
                  if (isImageUrl(formData.icon)) {
                    setFormData((prev) => ({ ...prev, icon: "" }));
                    setImagePreview(null);
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  iconType === "icon"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Tag className="w-4 h-4 inline mr-2" />
                Icon
              </button>
              <button
                type="button"
                onClick={() => {
                  setIconType("image");
                  if (!isImageUrl(formData.icon) && formData.icon) {
                    setFormData((prev) => ({ ...prev, icon: "" }));
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  iconType === "image"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <ImageIcon className="w-4 h-4 inline mr-2" />
                Image
              </button>
            </div>

            {iconType === "icon" ? (
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    id="gc_icon"
                    value={isImageUrl(formData.icon) ? "" : formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="e.g., Scissors, Heart, Star"
                    className="pr-10"
                  />
                  {formData.icon && !isImageUrl(formData.icon) && getIconByName(formData.icon) && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {(() => {
                        const IconComponent = getIconByName(formData.icon);
                        return IconComponent ? (
                          <IconComponent className="w-4 h-4 text-gray-400" />
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                >
                  Pick Icon
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Image Preview */}
                {imagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Icon preview"
                      className="w-20 h-20 object-contain border rounded-lg p-2 bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                
                {/* Upload File */}
                <div>
                  <Label htmlFor="icon-upload" className="cursor-pointer">
                    <div className="flex items-center gap-2 p-3 border-2 border-dashed rounded-lg hover:bg-gray-50 transition-colors">
                      <Upload className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {imagePreview ? "Change Image" : "Upload Image"}
                      </span>
                    </div>
                  </Label>
                  <Input
                    id="icon-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                {/* Or Enter URL */}
                <div>
                  <Label htmlFor="icon-url" className="text-sm text-gray-600">
                    Or enter image URL:
                  </Label>
                  <Input
                    id="icon-url"
                    type="url"
                    value={isImageUrl(formData.icon) ? formData.icon : ""}
                    onChange={(e) => handleImageUrlChange(e.target.value)}
                    placeholder="https://example.com/icon.png"
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            {iconType === "icon" && showIconPicker && (
              <div className="mt-2 p-4 border rounded-lg bg-gray-50 max-h-96 overflow-y-auto">
                <div className="mb-3 space-y-2">
                  <Input
                    placeholder="Search icons..."
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    className="w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    {iconCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedIconCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedIconCategory === cat
                            ? "bg-purple-600 text-white"
                            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Select an icon ({filteredIcons.length} {filteredIcons.length === 1 ? 'icon' : 'icons'}):
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {filteredIcons.map(({ name, icon: IconComponent, category }, index) => (
                    <button
                      key={`${category}-${name}-${index}`}
                      type="button"
                      onClick={() => handleIconSelect(name)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:bg-white hover:border-purple-400 hover:scale-105 ${
                        formData.icon === name
                          ? "bg-purple-100 border-purple-500"
                          : "bg-white border-gray-200"
                      }`}
                      title={name}
                    >
                      <IconComponent className="w-5 h-5 text-gray-700 mb-1" />
                      <span className="text-xs text-gray-600 truncate w-full text-center">
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
                {filteredIcons.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">
                    No icons found matching &quot;{iconSearch}&quot;
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-3">
                  Click an icon above, or type the icon name manually (e.g., &quot;Scissors&quot;, &quot;Heart&quot;)
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {iconType === "icon" 
                ? "A professional icon to represent this category (optional). Choose from the picker or type the icon name."
                : "Upload an image or enter an image URL to represent this category (optional). Max 2MB."}
            </p>
          </div>
          <div>
            <Label htmlFor="gc_description">Description</Label>
            <textarea
              id="gc_description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full p-2 border rounded-md min-h-[100px]"
            />
          </div>
          <div>
            <Label htmlFor="gc_display_order">Display Order</Label>
            <Input
              id="gc_display_order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="gc_is_featured"
                checked={formData.is_featured}
                onChange={(e) =>
                  setFormData({ ...formData, is_featured: e.target.checked })
                }
              />
              <Label htmlFor="gc_is_featured">Featured</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="gc_is_active"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <Label htmlFor="gc_is_active">Active</Label>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : category ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

