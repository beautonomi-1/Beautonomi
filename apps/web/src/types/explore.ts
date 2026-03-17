/**
 * Explore feature types
 */

export interface ExplorePost {
  id: string;
  provider_id: string;
  provider: {
    business_name: string;
    slug: string;
  };
  created_by_user_id?: string | null;
  caption: string | null;
  media_urls: string[];
  status: "draft" | "published";
  published_at: string;
  like_count: number;
  comment_count?: number;
  view_count?: number; // Only in provider "mine" context
  created_at: string;
  updated_at: string;
  is_saved?: boolean;
  is_liked?: boolean;
  tags?: string[];
  primary_category_id?: string | null;
  primary_category_slug?: string | null;
  /** When set, "Book this look" links to this offering */
  offering_id?: string | null;
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null;
  /** Only present in GET /api/explore/saved: collection (board) IDs this saved post belongs to */
  collection_ids?: string[];
}

export interface ExploreCommentAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ExploreComment {
  id: string;
  post_id: string;
  user_id: string;
  author: ExploreCommentAuthor;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ExplorePostsCursorResponse {
  data: ExplorePost[];
  next_cursor?: string;
  has_more: boolean;
}

export type ExploreEventType = "view" | "like";
