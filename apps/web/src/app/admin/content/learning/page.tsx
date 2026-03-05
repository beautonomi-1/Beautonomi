"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Edit, Trash2, BookOpen, FolderOpen, Star, Layout, ChevronRight } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";

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
  status: string;
  audience: string;
  is_internal: boolean;
  published_at: string | null;
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
                  <div className="flex gap-2 mb-4">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All categories</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground mb-4">{articles.length} articles.</p>
                    <ul className="space-y-2">
                      {articles.map((a) => (
                        <li key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <span className="font-medium">{a.title}</span>
                            <span className="text-sm text-muted-foreground ml-2">/{a.slug}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{a.status}</span>
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
        </div>
      </div>
    </RoleGuard>
  );
}
