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
