"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Edit, Trash2, BookOpen, FolderOpen, Star, Layout, ChevronRight, ExternalLink } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import { RADIX_SELECT_ALL } from "@/lib/ui/select-radix-sentinels";

interface LearningCategory {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  audience: string;
  visibility: string;
  parent_id?: string | null;
}

type TreeNode = LearningCategory & { children: TreeNode[] };

function buildTree(categories: LearningCategory[], parentId: string | null = null): TreeNode[] {
  return categories
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      ...c,
      children: buildTree(categories, c.id),
    }));
}

function CategoryTreeNodes({
  nodes,
  depth = 0,
  onEdit,
  onDelete,
  deletingId,
}: {
  nodes: TreeNode[];
  depth?: number;
  onEdit: (c: LearningCategory) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  return (
    <ul className="space-y-1 list-none">
      {nodes.map((node) => (
        <li key={node.id} style={{ paddingLeft: depth * 20 }} className="flex flex-col gap-0 py-1.5 border-b border-zinc-100 last:border-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {depth > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="font-medium truncate">{node.title}</span>
              <span className="text-sm text-muted-foreground shrink-0">{node.slug} · {node.audience}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(node)} aria-label="Edit">
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(node.id)}
                disabled={deletingId === node.id}
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {node.children.length > 0 && (
            <div className="w-full mt-1">
              <CategoryTreeNodes nodes={node.children} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} deletingId={deletingId} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

interface LearningArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  summary: string | null;
  body?: string;
  content_format?: string;
  content_type?: string;
  status: string;
  audience: string;
  is_internal: boolean;
  published_at: string | null;
  scheduled_at?: string | null;
  image_url?: string | null;
  hero_video_url?: string | null;
  featured_order?: number | null;
  learning_categories?: { title: string; slug: string };
}

export default function LearningCenterPage() {
  const [activeTab, setActiveTab] = useState<"categories" | "articles" | "featured" | "homepage">("categories");
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [articles, setArticles] = useState<LearningArticle[]>([]);
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featuredInput, setFeaturedInput] = useState("");
  const [homepage, setHomepage] = useState<{
    hero: { title: string; subtitle: string };
    cta_cards: { cards: Array<{ title: string; description: string; icon: string; link: string }> };
  }>({ hero: { title: "", subtitle: "" }, cta_cards: { cards: [] } });
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LearningCategory | null>(null);
  const [createForm, setCreateForm] = useState<{
    title: string;
    slug: string;
    icon: string;
    sort_order: number;
    audience: "general" | "customer" | "provider" | "internal";
    visibility: "public" | "internal";
    parent_id: string | null;
  }>({
    title: "",
    slug: "",
    icon: "",
    sort_order: 0,
    audience: "general",
    visibility: "public",
    parent_id: null,
  });
  const [editForm, setEditForm] = useState<{
    title: string;
    slug: string;
    icon: string;
    sort_order: number;
    audience: "general" | "customer" | "provider" | "internal";
    visibility: "public" | "internal";
    parent_id: string | null;
  }>({
    title: "",
    slug: "",
    icon: "",
    sort_order: 0,
    audience: "general",
    visibility: "public",
    parent_id: null,
  });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeletingId, setCategoryDeletingId] = useState<string | null>(null);

  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [showCreateArticle, setShowCreateArticle] = useState(false);
  const [articleSaving, setArticleSaving] = useState(false);
  const [articleDeletingId, setArticleDeletingId] = useState<string | null>(null);
  const [deleteConfirmArticle, setDeleteConfirmArticle] = useState<LearningArticle | null>(null);

  const defaultArticleForm = {
    category_id: "",
    title: "",
    slug: "",
    summary: "",
    body: "",
    content_format: "html" as "html" | "markdown",
    content_type: "article" as "article" | "video_guide",
    status: "draft" as "draft" | "published" | "scheduled" | "archived",
    audience: "general" as "general" | "customer" | "provider" | "internal",
    is_internal: false,
    image_url: "",
    hero_video_url: "",
    featured_order: "" as string | number,
    published_at: "",
    scheduled_at: "",
  };

  const [articleForm, setArticleForm] = useState<typeof defaultArticleForm>(defaultArticleForm);

  const loadCategories = async () => {
    const res = await fetcher.get<{ data: LearningCategory[] }>("/api/admin/content/learning/categories");
    setCategories(res.data ?? []);
  };

  const categoryTree = useMemo(() => buildTree(categories), [categories]);

  const loadArticles = async () => {
    const url = categoryFilter
      ? `/api/admin/content/learning/articles?category_id=${categoryFilter}`
      : "/api/admin/content/learning/articles";
    const res = await fetcher.get<{ data: LearningArticle[] }>(url);
    setArticles(res.data ?? []);
  };

  const loadFeatured = async () => {
    const res = await fetcher.get<{ data: { article_ids: string[] } }>("/api/admin/content/learning/featured");
    const ids = res.data?.article_ids ?? [];
    setFeaturedIds(ids);
    setFeaturedInput(ids.join(", "));
  };

  const loadHomepage = async () => {
    const res = await fetcher.get<{ data: Record<string, unknown> }>("/api/admin/content/learning/homepage");
    const d = res.data;
    if (d) {
      const hero = d.hero as { title?: string; subtitle?: string } | undefined;
      setHomepage({
        hero: { title: hero?.title ?? "", subtitle: hero?.subtitle ?? "" },
        cta_cards: (d.cta_cards as { cards: Array<{ title: string; description: string; icon: string; link: string }> }) ?? { cards: [] },
      });
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        await loadCategories();
        if (activeTab === "articles") await loadArticles();
        if (activeTab === "featured") await loadFeatured();
        if (activeTab === "homepage") await loadHomepage();
      } catch (e) {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [activeTab, categoryFilter]);

  const handleSaveFeatured = async () => {
    const ids = featuredInput.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await fetcher.patch("/api/admin/content/learning/featured", { article_ids: ids });
      setFeaturedIds(ids);
      toast.success("Featured articles updated");
    } catch {
      toast.error("Failed to update featured");
    }
  };

  const handleSaveHomepage = async () => {
    try {
      await fetcher.patch("/api/admin/content/learning/homepage", homepage);
      toast.success("Homepage config saved");
    } catch {
      toast.error("Failed to save homepage");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategorySaving(true);
    try {
      await fetcher.post<{ data: LearningCategory }>("/api/admin/content/learning/categories", {
        title: createForm.title.trim(),
        slug: createForm.slug.trim(),
        icon: createForm.icon.trim() || null,
        sort_order: createForm.sort_order,
        audience: createForm.audience,
        visibility: createForm.visibility,
        parent_id: createForm.parent_id || null,
      });
      toast.success("Category created");
      setShowCreateCategory(false);
      setCreateForm({ title: "", slug: "", icon: "", sort_order: 0, audience: "general", visibility: "public", parent_id: null });
      await loadCategories();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to create category");
    } finally {
      setCategorySaving(false);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    if (!editingCategory) return;
    e.preventDefault();
    setCategorySaving(true);
    try {
      await fetcher.put<{ data: LearningCategory }>(`/api/admin/content/learning/categories/${editingCategory.id}`, {
        title: editForm.title.trim(),
        slug: editForm.slug.trim(),
        icon: editForm.icon.trim() || null,
        sort_order: editForm.sort_order,
        audience: editForm.audience,
        visibility: editForm.visibility,
        parent_id: editForm.parent_id ?? null,
      });
      toast.success("Category updated");
      setEditingCategory(null);
      await loadCategories();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update category");
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setCategoryDeletingId(id);
    try {
      await fetcher.delete(`/api/admin/content/learning/categories/${id}`);
      toast.success("Category deleted");
      await loadCategories();
      if (editingCategory?.id === id) setEditingCategory(null);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to delete category");
    } finally {
      setCategoryDeletingId(null);
    }
  };

  const openEdit = (c: LearningCategory) => {
    setEditingCategory(c);
    setEditForm({
      title: c.title,
      slug: c.slug,
      icon: c.icon ?? "",
      sort_order: c.sort_order,
      audience: c.audience as "general" | "customer" | "provider" | "internal",
      visibility: c.visibility as "public" | "internal",
      parent_id: c.parent_id ?? null,
    });
  };

  const parentOptions = useMemo(() => {
    const excludeId = editingCategory?.id ?? "";
    return categories.filter((c) => c.id !== excludeId);
  }, [categories, editingCategory?.id]);

  const openCreateArticle = () => {
    setEditingArticleId(null);
    setArticleForm({
      ...defaultArticleForm,
      category_id: categoryFilter || (categories[0]?.id ?? ""),
    });
    setShowCreateArticle(true);
  };

  const openEditArticle = async (article: LearningArticle) => {
    try {
      const res = await fetcher.get<{ data: LearningArticle }>(`/api/admin/content/learning/articles/${article.id}`);
      const a = res.data;
      if (!a) {
        toast.error("Article not found");
        return;
      }
      setArticleForm({
        category_id: a.category_id,
        title: a.title,
        slug: a.slug,
        summary: a.summary ?? "",
        body: a.body ?? "",
        content_format: (a.content_format as "html" | "markdown") || "html",
        content_type: (a.content_type as "article" | "video_guide") || "article",
        status: (a.status as typeof defaultArticleForm.status) || "draft",
        audience: (a.audience as typeof defaultArticleForm.audience) || "general",
        is_internal: a.is_internal ?? false,
        image_url: a.image_url ?? "",
        hero_video_url: a.hero_video_url ?? "",
        featured_order: a.featured_order ?? "",
        published_at: a.published_at ? a.published_at.slice(0, 16) : "",
        scheduled_at: a.scheduled_at ? a.scheduled_at.slice(0, 16) : "",
      });
      setEditingArticleId(a.id);
      setShowCreateArticle(true);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to load article");
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    const categoryId = articleForm.category_id?.trim();
    if (!categoryId) {
      toast.error("Category is required");
      return;
    }
    if (!articleForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!articleForm.slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    setArticleSaving(true);
    try {
      const payload = {
        category_id: categoryId,
        title: articleForm.title.trim(),
        slug: articleForm.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        summary: articleForm.summary.trim() || null,
        body: articleForm.body || "",
        content_format: articleForm.content_format,
        content_type: articleForm.content_type,
        status: articleForm.status,
        audience: articleForm.audience,
        is_internal: articleForm.is_internal,
        image_url: articleForm.image_url.trim() ? articleForm.image_url.trim() : null,
        hero_video_url: articleForm.hero_video_url.trim() ? articleForm.hero_video_url.trim() : null,
        featured_order: articleForm.featured_order === "" || articleForm.featured_order === null ? null : Number(articleForm.featured_order),
        published_at: articleForm.published_at ? new Date(articleForm.published_at).toISOString() : null,
        scheduled_at: articleForm.scheduled_at ? new Date(articleForm.scheduled_at).toISOString() : null,
      };
      if (editingArticleId) {
        await fetcher.put<{ data: LearningArticle }>(`/api/admin/content/learning/articles/${editingArticleId}`, payload);
        toast.success("Article updated");
      } else {
        await fetcher.post<{ data: LearningArticle }>("/api/admin/content/learning/articles", payload);
        toast.success("Article created");
      }
      setShowCreateArticle(false);
      setEditingArticleId(null);
      await loadArticles();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to save article");
    } finally {
      setArticleSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    setArticleDeletingId(id);
    try {
      await fetcher.delete(`/api/admin/content/learning/articles/${id}`);
      toast.success("Article deleted");
      setDeleteConfirmArticle(null);
      await loadArticles();
      if (editingArticleId === id) {
        setShowCreateArticle(false);
        setEditingArticleId(null);
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to delete article");
    } finally {
      setArticleDeletingId(null);
    }
  };

  const isArticleEditorOpen = showCreateArticle;

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

  const handleArticleTitleChange = (title: string) => {
    setArticleForm((f) => ({
      ...f,
      title,
      slug: !editingArticleId ? slugify(title) : f.slug,
    }));
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Link href="/admin/content" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Content
          </Link>
          <h1 className="text-2xl font-semibold mb-2">Learning Center</h1>
          <p className="text-sm text-muted-foreground mb-6">Manage categories, articles, featured content, and homepage.</p>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="mb-4">
              <TabsTrigger value="categories" className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="articles" className="gap-2">
                <BookOpen className="w-4 h-4" />
                Articles
              </TabsTrigger>
              <TabsTrigger value="featured" className="gap-2">
                <Star className="w-4 h-4" />
                Featured
              </TabsTrigger>
              <TabsTrigger value="homepage" className="gap-2">
                <Layout className="w-4 h-4" />
                Homepage
              </TabsTrigger>
            </TabsList>

            {loading ? (
              <LoadingTimeout loadingMessage="Loading..." />
            ) : (
              <>
                <TabsContent value="categories" className="mt-4">
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm text-muted-foreground">
                        {categories.length} categories. Public: <a href="/learn" target="_blank" rel="noopener noreferrer" className="text-primary underline">/learn</a>
                      </p>
                      <Button
                        type="button"
                        variant={showCreateCategory ? "secondary" : "default"}
                        size="sm"
                        className="gap-2"
                        onClick={() => setShowCreateCategory((v) => !v)}
                      >
                        <Plus className="w-4 h-4" />
                        {showCreateCategory ? "Cancel" : "Add category"}
                      </Button>
                    </div>

                    {showCreateCategory && (
                      <form onSubmit={handleCreateCategory} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <h3 className="font-medium">New category</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Title</Label>
                            <Input
                              value={createForm.title}
                              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder="Category title"
                              required
                            />
                          </div>
                          <div>
                            <Label>Slug</Label>
                            <Input
                              value={createForm.slug}
                              onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                              placeholder="category-slug"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Parent</Label>
                            <Select
                              value={createForm.parent_id ?? "__root__"}
                              onValueChange={(v) => setCreateForm((f) => ({ ...f, parent_id: v === "__root__" ? null : v }))}
                            >
                              <SelectTrigger><SelectValue placeholder="(Root)" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__root__">(Root)</SelectItem>
                                {parentOptions.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Audience</Label>
                            <Select
                              value={createForm.audience}
                              onValueChange={(v) => setCreateForm((f) => ({ ...f, audience: v as typeof createForm.audience }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="general">general</SelectItem>
                                <SelectItem value="customer">customer</SelectItem>
                                <SelectItem value="provider">provider</SelectItem>
                                <SelectItem value="internal">internal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" disabled={categorySaving}>Create</Button>
                          <Button type="button" variant="outline" onClick={() => setShowCreateCategory(false)}>Cancel</Button>
                        </div>
                      </form>
                    )}

                    {editingCategory && (
                      <form onSubmit={handleUpdateCategory} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <h3 className="font-medium">Edit: {editingCategory.title}</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Title</Label>
                            <Input
                              value={editForm.title}
                              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <Label>Slug</Label>
                            <Input
                              value={editForm.slug}
                              onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))}
                              required
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Parent</Label>
                            <Select
                              value={editForm.parent_id ?? "__root__"}
                              onValueChange={(v) => setEditForm((f) => ({ ...f, parent_id: v === "__root__" ? null : v }))}
                            >
                              <SelectTrigger><SelectValue placeholder="(Root)" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__root__">(Root)</SelectItem>
                                {parentOptions.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Audience</Label>
                            <Select
                              value={editForm.audience}
                              onValueChange={(v) => setEditForm((f) => ({ ...f, audience: v as typeof editForm.audience }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="general">general</SelectItem>
                                <SelectItem value="customer">customer</SelectItem>
                                <SelectItem value="provider">provider</SelectItem>
                                <SelectItem value="internal">internal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" disabled={categorySaving}>Save</Button>
                          <Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>Cancel</Button>
                        </div>
                      </form>
                    )}

                    <div className="border-t pt-4">
                      <h3 className="font-medium mb-2">Tree</h3>
                      {categoryTree.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No categories yet.</p>
                      ) : (
                        <CategoryTreeNodes
                          nodes={categoryTree}
                          onEdit={openEdit}
                          onDelete={handleDeleteCategory}
                          deletingId={categoryDeletingId}
                        />
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="articles" className="mt-4">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Select
                      value={categoryFilter || RADIX_SELECT_ALL}
                      onValueChange={(v) => setCategoryFilter(v === RADIX_SELECT_ALL ? "" : v)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RADIX_SELECT_ALL}>All categories</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" className="gap-2" onClick={openCreateArticle} disabled={categories.length === 0}>
                      <Plus className="w-4 h-4" />
                      Add article
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      <a href="/learn" target="_blank" rel="noopener noreferrer" className="text-primary underline">Preview /learn</a>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground mb-4">{articles.length} articles. Edit any article to change body, hero image, and more.</p>
                    <ul className="space-y-2">
                      {articles.map((a) => (
                        <li key={a.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
                          <div className="min-w-0">
                            <span className="font-medium">{a.title}</span>
                            <span className="text-sm text-muted-foreground ml-2">/{a.slug}</span>
                            {a.learning_categories && (
                              <span className="text-xs text-muted-foreground ml-2">· {a.learning_categories.title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">{a.status}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditArticle(a)} aria-label="Edit article">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmArticle(a)}
                              aria-label="Delete article"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="featured" className="mt-4">
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground mb-4">Featured article IDs (in order) shown on the Learning Center homepage.</p>
                    <Input
                      value={featuredInput}
                      onChange={(e) => setFeaturedInput(e.target.value)}
                      placeholder="Paste comma-separated article IDs"
                      className="mb-4 font-mono text-sm"
                    />
                    <Button onClick={handleSaveFeatured}>Save featured</Button>
                  </div>
                </TabsContent>

                <TabsContent value="homepage" className="mt-4">
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <div>
                      <Label>Hero title</Label>
                      <Input
                        value={homepage.hero.title}
                        onChange={(e) => setHomepage((h) => ({ ...h, hero: { ...h.hero, title: e.target.value } }))}
                        placeholder="Learning Center"
                      />
                    </div>
                    <div>
                      <Label>Hero subtitle</Label>
                      <Input
                        value={homepage.hero.subtitle}
                        onChange={(e) => setHomepage((h) => ({ ...h, hero: { ...h.hero, subtitle: e.target.value } }))}
                        placeholder="Find guides and answers."
                      />
                    </div>
                    <Button onClick={handleSaveHomepage}>Save homepage</Button>
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>

          <Dialog
            open={isArticleEditorOpen}
            onOpenChange={(open) => {
              if (!open) {
                setShowCreateArticle(false);
                setEditingArticleId(null);
                setArticleForm(defaultArticleForm);
              }
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>{editingArticleId ? "Edit article" : "New article"}</DialogTitle>
                  {editingArticleId && articleForm.status === "published" && articleForm.slug && (
                    <a
                      href={`/learn/article/${encodeURIComponent(articleForm.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on site
                    </a>
                  )}
                </div>
                <DialogDescription>
                  Body supports HTML: &lt;img&gt;, &lt;video&gt;, and &lt;iframe&gt; for images, GIFs, and video. To embed YouTube: on YouTube click Share → Embed, copy the iframe code, and paste it into the body.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveArticle} className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Category</Label>
                    <Select
                      value={articleForm.category_id}
                      onValueChange={(v) => setArticleForm((f) => ({ ...f, category_id: v }))}
                      required
                    >
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Audience</Label>
                    <Select
                      value={articleForm.audience}
                      onValueChange={(v) => setArticleForm((f) => ({ ...f, audience: v as typeof articleForm.audience }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">general</SelectItem>
                        <SelectItem value="customer">customer</SelectItem>
                        <SelectItem value="provider">provider</SelectItem>
                        <SelectItem value="internal">internal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={articleForm.title}
                      onChange={(e) => handleArticleTitleChange(e.target.value)}
                      placeholder="Article title"
                      required
                    />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input
                      value={articleForm.slug}
                      onChange={(e) => setArticleForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                      placeholder="article-slug"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Summary (optional)</Label>
                  <Input
                    value={articleForm.summary}
                    onChange={(e) => setArticleForm((f) => ({ ...f, summary: e.target.value }))}
                    placeholder="Short summary"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Hero image URL (optional)</Label>
                    <Input
                      value={articleForm.image_url}
                      onChange={(e) => setArticleForm((f) => ({ ...f, image_url: e.target.value }))}
                      placeholder="https://… or /images/learn/…"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Screenshot or illustration. Use a full URL or a path under /public (e.g. /images/learn/…).</p>
                  </div>
                  <div>
                    <Label>Hero video / GIF URL (optional)</Label>
                    <Input
                      value={articleForm.hero_video_url}
                      onChange={(e) => setArticleForm((f) => ({ ...f, hero_video_url: e.target.value }))}
                      placeholder="YouTube, Vimeo, or direct .mp4 / .gif"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Shown above the hero image when set. YouTube/Vimeo link, or direct file URL. Overrides hero image for the top slot only.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Content format</Label>
                    <Select
                      value={articleForm.content_format}
                      onValueChange={(v) => setArticleForm((f) => ({ ...f, content_format: v as "html" | "markdown" }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Content type</Label>
                    <Select
                      value={articleForm.content_type}
                      onValueChange={(v) => setArticleForm((f) => ({ ...f, content_type: v as "article" | "video_guide" }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="article">Article</SelectItem>
                        <SelectItem value="video_guide">Video guide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Body (HTML or Markdown; images, &lt;video&gt;, YouTube iframe embeds)</Label>
                  <Textarea
                    value={articleForm.body}
                    onChange={(e) => setArticleForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="<p>Your content.</p> <p>YouTube: Share → Embed, paste the iframe code here.</p>"
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={articleForm.status}
                      onValueChange={(v) => setArticleForm((f) => ({ ...f, status: v as typeof articleForm.status }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="published">published</SelectItem>
                        <SelectItem value="scheduled">scheduled</SelectItem>
                        <SelectItem value="archived">archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Featured order (optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={articleForm.featured_order === "" ? "" : articleForm.featured_order}
                      onChange={(e) => setArticleForm((f) => ({ ...f, featured_order: e.target.value === "" ? "" : Number(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Published at (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={articleForm.published_at}
                      onChange={(e) => setArticleForm((f) => ({ ...f, published_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Scheduled at (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={articleForm.scheduled_at}
                      onChange={(e) => setArticleForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="article-internal"
                    checked={articleForm.is_internal}
                    onCheckedChange={(checked) => setArticleForm((f) => ({ ...f, is_internal: !!checked }))}
                  />
                  <Label htmlFor="article-internal" className="text-sm font-normal cursor-pointer">Internal only (not shown on public /learn)</Label>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setShowCreateArticle(false); setEditingArticleId(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={articleSaving}>
                    {articleSaving ? "Saving..." : editingArticleId ? "Save changes" : "Create article"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteConfirmArticle} onOpenChange={(open) => { if (!open) setDeleteConfirmArticle(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete article?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{deleteConfirmArticle?.title}&quot;. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteConfirmArticle && handleDeleteArticle(deleteConfirmArticle.id)}
                  disabled={articleDeletingId === deleteConfirmArticle?.id}
                >
                  {articleDeletingId === deleteConfirmArticle?.id ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </RoleGuard>
  );
}
