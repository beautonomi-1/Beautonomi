import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { hasPermission } from "@/lib/auth/permissions";
import type { ExplorePost, ExplorePostsCursorResponse } from "@/types/explore";
import { toPublicMediaUrl, toStoragePath } from "@/lib/explore/media-urls";
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Cursor for nearby sort: distance_km, published_at, id */
interface NearbyCursor {
  distance_km: number;
  published_at: string;
  id: string;
}

/** Cursor for fuzzy search pagination: search_rank, published_at, id */
interface SearchCursor {
  search_rank: number;
  published_at: string;
  id: string;
}

/** Cursor for client-sorted search pages (trending / for_you): skip offset into ranked pool */
interface SearchSkipCursor {
  search_skip: number;
}

function sanitizeExploreSearch(raw: string | null): string | null {
  if (!raw) return null;
  const safe = raw.replace(/[%*\\(),."']/g, "").trim();
  if (safe.length < 2) return null;
  return safe;
}

function mapToExplorePost(
  row: any,
  savedIds: Set<string>,
  likedIds: Set<string>,
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null
): ExplorePost {
  const mediaUrls = (row.media_urls || []).map((p: string) =>
    toPublicMediaUrl(p, supabaseUrl())
  );
  const provider = row.providers
    ? { business_name: row.providers.business_name, slug: row.providers.slug }
    : row.provider_business_name
      ? { business_name: row.provider_business_name, slug: row.provider_slug }
      : { business_name: "", slug: "" };
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider,
    created_by_user_id: row.created_by_user_id,
    caption: row.caption,
    media_urls: mediaUrls,
    status: row.status,
    published_at: row.published_at,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    view_count: row.view_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_saved: savedIds.has(row.id),
    is_liked: likedIds.has(row.id),
    tags: row.tags ?? [],
    primary_category_id: row.primary_category_id ?? null,
    offering_id: row.offering_id ?? null,
    offering: offering ?? null,
  };
}

function calculateTrendingScore(post: {
  like_count: number;
  comment_count: number;
  save_count?: number;
  view_count?: number;
  published_at: string;
}): number {
  const likes = post.like_count ?? 0;
  const comments = post.comment_count ?? 0;
  const saves = post.save_count ?? 0;
  const views = post.view_count ?? 0;
  const hoursSincePost =
    (Date.now() - new Date(post.published_at).getTime()) / (1000 * 60 * 60);

  return likes * 2 + comments * 3 + saves * 5 + views * 0.5 - hoursSincePost * 0.5;
}

/**
 * GET /api/explore/posts
 * List published posts with cursor pagination. Optional auth for is_saved/is_liked.
 *
 * Query params:
 *   - cursor   — base64url-encoded cursor for pagination
 *   - limit    — max items per page (default 20, max 50)
 *   - sort       — "chronological" (default), "trending", "nearby", or "for_you" (personalized; auth required)
 *   - lat, lng   — optional; for sort=nearby (or use city)
 *   - city       — optional; for sort=nearby when lat/lng not provided (uses first provider_location in city as center)
 *   - radius_km  — optional; for sort=nearby (default 50)
 *   - category   — global service category slug (e.g. "hair") - filters by provider's categories
 *   - search     — fuzzy text search on caption, tags, provider name, and linked service
 *   - tags       — comma-separated tags to filter by (e.g. "braids,balayage")
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    const supabase = await getSupabaseServer(request);
    const { data: { user } } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const cursorEncoded = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const sortParam = searchParams.get("sort")?.toLowerCase();
    const sortMode =
      sortParam === "trending" ? "trending" :
      sortParam === "nearby" ? "nearby" :
      sortParam === "for_you" ? "for_you" : "chronological";
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const cityParam = searchParams.get("city")?.trim() || null;
    const radiusKm = Math.min(
      Math.max(1, parseFloat(searchParams.get("radius_km") || "50") || 50),
      200
    );
    const categorySlug = searchParams.get("category")?.trim().toLowerCase() || null;
    const searchQuery = searchParams.get("search")?.trim() || null;
    const sanitizedSearch = sanitizeExploreSearch(searchQuery);
    const tagsParam = searchParams.get("tags")?.trim() || null;
    const filterTags = tagsParam ? tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : null;

    let cursorPublishedAt: string | null = null;
    let cursorId: string | null = null;
    let cursorNearby: NearbyCursor | null = null;
    let cursorSearch: SearchCursor | null = null;
    let cursorSearchSkip: number | null = null;
    if (cursorEncoded) {
      try {
        const cursor = JSON.parse(
          Buffer.from(cursorEncoded, "base64url").toString()
        ) as {
          published_at?: string;
          id?: string;
          distance_km?: number;
          search_rank?: number;
          search_skip?: number;
        };
        if (typeof cursor.search_skip === "number" && cursor.search_skip >= 0) {
          cursorSearchSkip = cursor.search_skip;
        } else if (cursor.search_rank != null && cursor.published_at && cursor.id) {
          cursorSearch = {
            search_rank: cursor.search_rank,
            published_at: cursor.published_at,
            id: cursor.id,
          };
        } else if (cursor.distance_km != null && cursor.published_at && cursor.id) {
          cursorNearby = {
            distance_km: cursor.distance_km,
            published_at: cursor.published_at,
            id: cursor.id,
          };
        } else {
          cursorPublishedAt = cursor.published_at ?? null;
          cursorId = cursor.id ?? null;
        }
      } catch {
        return errorResponse("Invalid cursor", "BAD_REQUEST", 400);
      }
    }

    // Category filter: post-level primary_category_id OR provider in category
    let categoryId: string | null = null;
    let categoryProviderIds: string[] | null = null;
    if (categorySlug) {
      const { data: catRow } = await supabaseAdmin
        .from("global_service_categories")
        .select("id")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .single();

      if (catRow) {
        categoryId = catRow.id;
        const { data: assocs } = await supabaseAdmin
          .from("provider_global_category_associations")
          .select("provider_id")
          .eq("global_category_id", catRow.id);
        categoryProviderIds = (assocs || []).map((a: any) => a.provider_id);
      } else {
        return successResponse({ data: [], next_cursor: undefined, has_more: false });
      }
    }

    const hasLatLng =
      latParam != null &&
      lngParam != null &&
      Number.isFinite(Number(latParam)) &&
      Number.isFinite(Number(lngParam));
    const hasCity = !!cityParam;

    // --- Fuzzy search path (caption, tags, provider name, offering title) ---
    if (sanitizedSearch) {
      let nearbyProviderIds: string[] | null = null;
      let providerDistanceKm: Map<string, number> | null = null;

      if (sortMode === "nearby" && (hasLatLng || hasCity)) {
        let centerLat: number;
        let centerLng: number;
        if (hasLatLng) {
          centerLat = Number(latParam);
          centerLng = Number(lngParam);
        } else {
          const { data: locRow } = await supabaseAdmin
            .from("provider_locations")
            .select("latitude, longitude")
            .eq("is_active", true)
            .not("latitude", "is", null)
            .not("longitude", "is", null)
            .ilike("city", cityParam!)
            .limit(1)
            .maybeSingle();
          if (!locRow?.latitude || !locRow?.longitude) {
            return successResponse({ data: [], next_cursor: undefined, has_more: false });
          }
          centerLat = Number(locRow.latitude);
          centerLng = Number(locRow.longitude);
        }

        const { data: locations } = await supabaseAdmin
          .from("provider_locations")
          .select("provider_id, latitude, longitude")
          .eq("is_active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null);

        providerDistanceKm = new Map<string, number>();
        (locations || []).forEach((loc: any) => {
          const km = haversineDistanceKmFromCoords(
            centerLat,
            centerLng,
            Number(loc.latitude),
            Number(loc.longitude),
          );
          const existing = providerDistanceKm!.get(loc.provider_id);
          if (existing == null || km < existing) providerDistanceKm!.set(loc.provider_id, km);
        });
        nearbyProviderIds = [...providerDistanceKm.entries()]
          .filter(([, km]) => km <= radiusKm)
          .map(([id]) => id);
        if (nearbyProviderIds.length === 0) {
          return successResponse({ data: [], next_cursor: undefined, has_more: false });
        }
      }

      const clientSortedSearch = sortMode === "trending" || sortMode === "for_you";
      const useRpcRankCursor = sortMode === "chronological" && cursorSearch != null;

      const searchFetchLimit =
        clientSortedSearch || sortMode === "nearby"
          ? Math.min(200, Math.max(limit * 4, 100))
          : limit + 1;

      const { data: searchRows, error: searchErr } = await supabaseAdmin.rpc("explore_search_posts", {
        p_query: sanitizedSearch,
        p_category_id: categoryId,
        p_category_provider_ids:
          categoryProviderIds && categoryProviderIds.length > 0 ? categoryProviderIds : null,
        p_tags: filterTags && filterTags.length > 0 ? filterTags : null,
        p_provider_ids: nearbyProviderIds,
        p_limit: searchFetchLimit,
        p_cursor_rank: useRpcRankCursor ? cursorSearch!.search_rank : null,
        p_cursor_published_at: useRpcRankCursor ? cursorSearch!.published_at : null,
        p_cursor_id: useRpcRankCursor ? cursorSearch!.id : null,
      });

      if (searchErr) {
        console.error("[explore/posts] Fuzzy search error:", searchErr);
        return handleApiError(searchErr, "Failed to search posts");
      }

      let items: any[] = searchRows || [];

      if (sortMode === "nearby" && providerDistanceKm) {
        items = items.map((r: any) => ({
          ...r,
          distance_km: providerDistanceKm!.get(r.provider_id) ?? Infinity,
        }));
        items.sort((a: any, b: any) => {
          if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
          if (b.search_rank !== a.search_rank) return b.search_rank - a.search_rank;
          const tA = new Date(a.published_at).getTime();
          const tB = new Date(b.published_at).getTime();
          if (tB !== tA) return tB - tA;
          return a.id.localeCompare(b.id);
        });
        if (cursorNearby) {
          const after = (r: any) => {
            if (r.distance_km !== cursorNearby!.distance_km) return r.distance_km > cursorNearby!.distance_km;
            const t = new Date(r.published_at).getTime();
            const ct = new Date(cursorNearby!.published_at).getTime();
            if (t !== ct) return t < ct;
            return r.id > cursorNearby!.id;
          };
          items = items.filter(after);
        }
      } else if (sortMode === "trending") {
        items.sort((a: any, b: any) => calculateTrendingScore(b) - calculateTrendingScore(a));
      } else if (sortMode === "for_you" && user && items.length > 0) {
        const [savedRes, likedRes] = await Promise.all([
          supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id),
          supabaseAdmin
            .from("explore_events")
            .select("post_id")
            .eq("actor_type", "authed")
            .eq("actor_key", user.id)
            .eq("event_type", "like"),
        ]);
        const preferredPostIds = [
          ...(savedRes.data || []).map((r: any) => r.post_id),
          ...(likedRes.data || []).map((r: any) => r.post_id),
        ].filter(Boolean);
        const preferredProviderIds = new Set<string>();
        const preferredCategoryIds = new Set<string>();
        if (preferredPostIds.length > 0) {
          const { data: prefPosts } = await supabaseAdmin
            .from("explore_posts")
            .select("provider_id, primary_category_id")
            .in("id", [...new Set(preferredPostIds)].slice(0, 500));
          (prefPosts || []).forEach((p: any) => {
            if (p.provider_id) preferredProviderIds.add(p.provider_id);
            if (p.primary_category_id) preferredCategoryIds.add(p.primary_category_id);
          });
        }
        const now = Date.now();
        items.sort((a: any, b: any) => {
          const score = (r: any) => {
            let s = r.search_rank ?? 0;
            if (preferredProviderIds.has(r.provider_id)) s += 2;
            if (r.primary_category_id && preferredCategoryIds.has(r.primary_category_id)) s += 1;
            const hours = (now - new Date(r.published_at).getTime()) / (1000 * 60 * 60);
            s += 1 / (1 + hours / 24);
            return s;
          };
          return score(b) - score(a);
        });
      }

      if (clientSortedSearch) {
        const skip = cursorSearchSkip ?? 0;
        items = items.slice(skip);
      }

      const hasMoreSearch = items.length > limit;
      const sliceSearch = hasMoreSearch ? items.slice(0, limit) : items;
      const lastSearch = sliceSearch[sliceSearch.length - 1];

      const postIdsSearch = sliceSearch.map((r: any) => r.id);
      const savedIdsSearch = new Set<string>();
      const likedIdsSearch = new Set<string>();
      if (user && postIdsSearch.length > 0) {
        const [savedRes, likedRes] = await Promise.all([
          supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id).in("post_id", postIdsSearch),
          supabaseAdmin
            .from("explore_events")
            .select("post_id")
            .eq("actor_type", "authed")
            .eq("actor_key", user.id)
            .eq("event_type", "like")
            .in("post_id", postIdsSearch),
        ]);
        (savedRes.data || []).forEach((r: any) => savedIdsSearch.add(r.post_id));
        (likedRes.data || []).forEach((r: any) => likedIdsSearch.add(r.post_id));
      }

      const offeringIdsSearch = [...new Set(sliceSearch.map((r: any) => r.offering_id).filter(Boolean))];
      const offeringMapSearch = new Map<
        string,
        { id: string; name: string; price?: number; duration_minutes?: number }
      >();
      if (offeringIdsSearch.length > 0) {
        const { data: offDataSearch } = await supabaseAdmin
          .from("offerings")
          .select("id, title, price, duration_minutes")
          .in("id", offeringIdsSearch);
        (offDataSearch || []).forEach((o: any) =>
          offeringMapSearch.set(o.id, {
            id: o.id,
            name: o.title ?? "",
            price: o.price != null ? Number(o.price) : undefined,
            duration_minutes: o.duration_minutes ?? undefined,
          }),
        );
      }

      const dataSearch: ExplorePost[] = sliceSearch.map((r: any) =>
        mapToExplorePost(r, savedIdsSearch, likedIdsSearch, offeringMapSearch.get(r.offering_id) ?? null),
      );

      let nextCursorSearch: string | undefined;
      if (hasMoreSearch && lastSearch) {
        if (sortMode === "nearby" && lastSearch.distance_km != null) {
          nextCursorSearch = Buffer.from(
            JSON.stringify({
              distance_km: lastSearch.distance_km,
              published_at: lastSearch.published_at,
              id: lastSearch.id,
            }),
          ).toString("base64url");
        } else if (clientSortedSearch) {
          nextCursorSearch = Buffer.from(
            JSON.stringify({
              search_skip: (cursorSearchSkip ?? 0) + limit,
            }),
          ).toString("base64url");
        } else {
          nextCursorSearch = Buffer.from(
            JSON.stringify({
              search_rank: lastSearch.search_rank,
              published_at: lastSearch.published_at,
              id: lastSearch.id,
            }),
          ).toString("base64url");
        }
      }

      return successResponse({
        data: dataSearch,
        next_cursor: nextCursorSearch,
        has_more: hasMoreSearch,
      });
    }

    // --- sort=nearby: location-based feed (no text search) ---
    if (sortMode === "nearby" && (hasLatLng || hasCity)) {
      let centerLat: number;
      let centerLng: number;
      if (hasLatLng) {
        centerLat = Number(latParam);
        centerLng = Number(lngParam);
      } else {
        const { data: locRow } = await supabaseAdmin
          .from("provider_locations")
          .select("latitude, longitude")
          .eq("is_active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .ilike("city", cityParam!)
          .limit(1)
          .maybeSingle();
        if (!locRow?.latitude || !locRow?.longitude) {
          return successResponse({ data: [], next_cursor: undefined, has_more: false });
        }
        centerLat = Number(locRow.latitude);
        centerLng = Number(locRow.longitude);
      }

      const { data: locations } = await supabaseAdmin
        .from("provider_locations")
        .select("provider_id, latitude, longitude")
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      const providerDistanceKm = new Map<string, number>();
      (locations || []).forEach((loc: any) => {
        const km = haversineDistanceKmFromCoords(centerLat, centerLng, Number(loc.latitude), Number(loc.longitude));
        const existing = providerDistanceKm.get(loc.provider_id);
        if (existing == null || km < existing) providerDistanceKm.set(loc.provider_id, km);
      });
      const providerIdsInRadius = [...providerDistanceKm.entries()]
        .filter(([, km]) => km <= radiusKm)
        .map(([id]) => id);
      if (providerIdsInRadius.length === 0) {
        return successResponse({ data: [], next_cursor: undefined, has_more: false });
      }

      const nearbyFetchLimit = Math.min(200, Math.max(limit * 4, 100));
      let nearbyQuery = supabaseAdmin
        .from("explore_posts")
        .select("id, provider_id, created_by_user_id, caption, media_urls, tags, status, published_at, like_count, comment_count, view_count, primary_category_id, offering_id, created_at, updated_at")
        .eq("status", "published")
        .eq("is_hidden", false)
        .in("provider_id", providerIdsInRadius)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(nearbyFetchLimit);

      if (categoryProviderIds) {
        nearbyQuery = nearbyQuery.in("provider_id", categoryProviderIds);
      }
      if (filterTags && filterTags.length > 0) {
        nearbyQuery = nearbyQuery.overlaps("tags", filterTags);
      }

      const { data: nearbyRows, error: nearbyError } = await nearbyQuery;
      if (nearbyError) return handleApiError(nearbyError, "Failed to fetch posts");

      let nearbyItems = (nearbyRows || []).map((r: any) => ({
        ...r,
        distance_km: providerDistanceKm.get(r.provider_id) ?? Infinity,
      }));
      nearbyItems.sort((a: any, b: any) => {
        if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
        const tA = new Date(a.published_at).getTime();
        const tB = new Date(b.published_at).getTime();
        if (tB !== tA) return tB - tA;
        return a.id.localeCompare(b.id);
      });

      if (cursorNearby) {
        const after = (r: any) => {
          if (r.distance_km !== cursorNearby!.distance_km) return r.distance_km > cursorNearby!.distance_km;
          const t = new Date(r.published_at).getTime();
          const ct = new Date(cursorNearby!.published_at).getTime();
          if (t !== ct) return t < ct;
          return r.id > cursorNearby!.id;
        };
        nearbyItems = nearbyItems.filter(after);
      }

      const hasMoreNearby = nearbyItems.length > limit;
      const sliceNearby = hasMoreNearby ? nearbyItems.slice(0, limit) : nearbyItems;
      const lastNearby = sliceNearby[sliceNearby.length - 1];

      const providerIdsNearby = [...new Set(sliceNearby.map((r: any) => r.provider_id))];
      const { data: provDataNearby } = await supabaseAdmin
        .from("providers")
        .select("id, business_name, slug")
        .in("id", providerIdsNearby);
      const provMapNearby = new Map((provDataNearby || []).map((p: any) => [p.id, p]));

      const postIdsNearby = sliceNearby.map((r: any) => r.id);
      const savedIdsNearby = new Set<string>();
      const likedIdsNearby = new Set<string>();
      if (user && postIdsNearby.length > 0) {
        const [savedRes, likedRes] = await Promise.all([
          supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id).in("post_id", postIdsNearby),
          supabaseAdmin.from("explore_events").select("post_id").eq("actor_type", "authed").eq("actor_key", user.id).eq("event_type", "like").in("post_id", postIdsNearby),
        ]);
        (savedRes.data || []).forEach((r: any) => savedIdsNearby.add(r.post_id));
        (likedRes.data || []).forEach((r: any) => likedIdsNearby.add(r.post_id));
      }

      const offeringIdsNearby = [...new Set(sliceNearby.map((r: any) => r.offering_id).filter(Boolean))];
      const offeringMapNearby = new Map<string, { id: string; name: string; price?: number; duration_minutes?: number }>();
      if (offeringIdsNearby.length > 0) {
        const { data: offDataNearby } = await supabaseAdmin
          .from("offerings")
          .select("id, title, price, duration_minutes")
          .in("id", offeringIdsNearby);
        (offDataNearby || []).forEach((o: any) =>
          offeringMapNearby.set(o.id, { id: o.id, name: o.title ?? "", price: o.price != null ? Number(o.price) : undefined, duration_minutes: o.duration_minutes ?? undefined })
        );
      }

      const dataNearby: ExplorePost[] = sliceNearby.map((r: any) =>
        mapToExplorePost(
          {
            ...r,
            provider_business_name: provMapNearby.get(r.provider_id)?.business_name ?? "",
            provider_slug: provMapNearby.get(r.provider_id)?.slug ?? "",
          },
          savedIdsNearby,
          likedIdsNearby,
          offeringMapNearby.get(r.offering_id) ?? null
        )
      );

      let nextCursorNearby: string | undefined;
      if (hasMoreNearby && lastNearby) {
        nextCursorNearby = Buffer.from(
          JSON.stringify({
            distance_km: lastNearby.distance_km,
            published_at: lastNearby.published_at,
            id: lastNearby.id,
          })
        ).toString("base64url");
      }

      return successResponse({
        data: dataNearby,
        next_cursor: nextCursorNearby,
        has_more: hasMoreNearby,
      });
    }

    const fetchLimit =
      sortMode === "trending" || sortMode === "for_you" ? Math.max(limit * 3, 100) : limit + 1;

    let query = supabaseAdmin
      .from("explore_posts")
      .select(
        "id, provider_id, created_by_user_id, caption, media_urls, tags, status, published_at, like_count, comment_count, view_count, primary_category_id, offering_id, created_at, updated_at"
      )
      .eq("status", "published")
      .eq("is_hidden", false)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit);

    if (cursorPublishedAt && cursorId) {
      query = query.lt("published_at", cursorPublishedAt);
    }

    // Category filter: post primary_category_id OR provider in category (prefer post-level)
    if (categoryId) {
      if (categoryProviderIds && categoryProviderIds.length > 0) {
        query = query.or(
          `primary_category_id.eq.${categoryId},provider_id.in.(${categoryProviderIds.join(",")})`
        );
      } else {
        query = query.eq("primary_category_id", categoryId);
      }
    }

    // Option B: filter by post tags
    if (filterTags && filterTags.length > 0) {
      query = query.overlaps("tags", filterTags);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("[explore/posts] Fetch error:", error);
      return handleApiError(error, "Failed to fetch posts");
    }

    let items = rows || [];

    if (items.length === 0 && process.env.NODE_ENV === "development") {
      const [
        { count: total },
        { count: published },
        { count: hidden },
      ] = await Promise.all([
        supabaseAdmin.from("explore_posts").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("explore_posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
        supabaseAdmin
          .from("explore_posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .eq("is_hidden", true),
      ]);
      console.log(
        "[explore/posts] 0 posts returned. DB: total=" +
          (total ?? "?") +
          ", published=" +
          (published ?? "?") +
          ", published+hidden=" +
          (hidden ?? "?") +
          (categorySlug ? `, category=${categorySlug}` : "") +
          (searchQuery ? `, search=${searchQuery}` : "") +
          (filterTags ? `, tags=${filterTags.join(",")}` : "")
      );
    }

    // Enrich with provider data
    if (items.length > 0) {
      const providerIds = [...new Set(items.map((r: any) => r.provider_id))];
      const { data: provData } = await supabaseAdmin
        .from("providers")
        .select("id, business_name, slug")
        .in("id", providerIds);
      const provMap = new Map((provData || []).map((p: any) => [p.id, p]));

      items = items.map((r: any) => ({
        ...r,
        provider_business_name: provMap.get(r.provider_id)?.business_name ?? "",
        provider_slug: provMap.get(r.provider_id)?.slug ?? "",
      }));
    }

    // Apply trending sort when requested
    if (sortMode === "trending") {
      items.sort(
        (a: any, b: any) => calculateTrendingScore(b) - calculateTrendingScore(a)
      );
      items = items.slice(0, limit + 1);
    }

    // For You: personalize by preferred providers/categories from user's likes and saves
    if (sortMode === "for_you" && user && items.length > 0) {
      const [savedRes, likedRes] = await Promise.all([
        supabaseAdmin.from("explore_saved").select("post_id").eq("user_id", user.id),
        supabaseAdmin.from("explore_events").select("post_id").eq("actor_type", "authed").eq("actor_key", user.id).eq("event_type", "like"),
      ]);
      const preferredPostIds = [
        ...(savedRes.data || []).map((r: any) => r.post_id),
        ...(likedRes.data || []).map((r: any) => r.post_id),
      ].filter(Boolean);
      const preferredProviderIds = new Set<string>();
      const preferredCategoryIds = new Set<string>();
      if (preferredPostIds.length > 0) {
        const { data: prefPosts } = await supabaseAdmin
          .from("explore_posts")
          .select("provider_id, primary_category_id")
          .in("id", [...new Set(preferredPostIds)].slice(0, 500));
        (prefPosts || []).forEach((p: any) => {
          if (p.provider_id) preferredProviderIds.add(p.provider_id);
          if (p.primary_category_id) preferredCategoryIds.add(p.primary_category_id);
        });
      }
      const now = Date.now();
      items.sort((a: any, b: any) => {
        const score = (r: any) => {
          let s = 0;
          if (preferredProviderIds.has(r.provider_id)) s += 2;
          if (r.primary_category_id && preferredCategoryIds.has(r.primary_category_id)) s += 1;
          const hours = (now - new Date(r.published_at).getTime()) / (1000 * 60 * 60);
          s += 1 / (1 + hours / 24);
          return s;
        };
        return score(b) - score(a);
      });
      items = items.slice(0, limit + 1);
    }

    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;
    const last = slice[slice.length - 1];

    const postIds = slice.map((r: any) => r.id);
    const savedIds = new Set<string>();
    const likedIds = new Set<string>();

    if (user && postIds.length > 0) {
      const [savedRes, likedRes] = await Promise.all([
        supabaseAdmin
          .from("explore_saved")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds),
        supabaseAdmin
          .from("explore_events")
          .select("post_id")
          .eq("actor_type", "authed")
          .eq("actor_key", user.id)
          .eq("event_type", "like")
          .in("post_id", postIds),
      ]);
      (savedRes.data || []).forEach((r: any) => savedIds.add(r.post_id));
      (likedRes.data || []).forEach((r: any) => likedIds.add(r.post_id));
    }

    const offeringIds = [...new Set(slice.map((r: any) => r.offering_id).filter(Boolean))];
    const offeringMap = new Map<string, { id: string; name: string; price?: number; duration_minutes?: number }>();
    if (offeringIds.length > 0) {
      const { data: offData } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .in("id", offeringIds);
      (offData || []).forEach((o: any) =>
        offeringMap.set(o.id, { id: o.id, name: o.title ?? "", price: o.price != null ? Number(o.price) : undefined, duration_minutes: o.duration_minutes ?? undefined })
      );
    }

    const data: ExplorePost[] = slice.map((r: any) =>
      mapToExplorePost(r, savedIds, likedIds, offeringMap.get(r.offering_id) ?? null)
    );

    let nextCursor: string | undefined;
    if (hasMore && last) {
      nextCursor = Buffer.from(
        JSON.stringify({ published_at: last.published_at, id: last.id })
      ).toString("base64url");
    }

    const response: ExplorePostsCursorResponse = {
      data,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to fetch posts");
  }
}

/**
 * POST /api/explore/posts
 * Create post. Provider owner or staff with create_explore_posts permission.
 * Accepts optional tags[] for categorisation.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const isOwner =
      (await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .single()).data != null;

    if (!isOwner) {
      const hasCreatePermission = await hasPermission(
        user.id,
        "create_explore_posts" as any,
        undefined,
        request,
      );
      if (!hasCreatePermission) {
        return errorResponse("Permission denied: create_explore_posts required", "FORBIDDEN", 403);
      }
    }

    const body = await request.json();
    const {
      caption,
      media_urls: rawMediaUrls = [],
      status = "draft",
      tags = [],
      primary_category_slug,
      primary_category_id: bodyCategoryId,
      offering_id: bodyOfferingId,
      also_add_to_gallery: alsoAddToGallery = false,
      booking_id: bodyBookingId,
    } = body;

    if (!Array.isArray(rawMediaUrls) || rawMediaUrls.length === 0) {
      return errorResponse("At least one media file is required", "VALIDATION_ERROR", 400);
    }
    if (rawMediaUrls.length > 5) {
      return errorResponse("Explore posts can include up to 5 media files", "VALIDATION_ERROR", 400);
    }

    const media_urls = rawMediaUrls.map((u: string) => toStoragePath(String(u)));

    const sanitizedTags = Array.isArray(tags)
      ? [...new Set(tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
      : [];

    let primary_category_id: string | null = null;
    if (bodyCategoryId && typeof bodyCategoryId === "string") {
      const { data: cat } = await supabaseAdmin
        .from("global_service_categories")
        .select("id")
        .eq("id", bodyCategoryId)
        .eq("is_active", true)
        .single();
      if (cat) primary_category_id = cat.id;
    } else if (primary_category_slug && typeof primary_category_slug === "string") {
      const { data: cat } = await supabaseAdmin
        .from("global_service_categories")
        .select("id")
        .eq("slug", primary_category_slug.trim().toLowerCase())
        .eq("is_active", true)
        .single();
      if (cat) primary_category_id = cat.id;
    }

    let offering_id: string | null = null;
    if (bodyOfferingId != null && bodyOfferingId !== "") {
      if (typeof bodyOfferingId !== "string") {
        return errorResponse("offering_id must be a UUID string", "VALIDATION_ERROR", 400);
      }
      const { data: off } = await supabaseAdmin.from("offerings").select("id, provider_id").eq("id", bodyOfferingId).single();
      if (!off || off.provider_id !== providerId) {
        return errorResponse("Offering not found or does not belong to your provider", "VALIDATION_ERROR", 400);
      }
      offering_id = off.id;
    }

    // Optional booking context (e.g. "post your work" prompt on completion).
    // Used only for gallery attribution below — not persisted on explore_posts.
    let bookingId: string | null = null;
    if (bodyBookingId != null && bodyBookingId !== "") {
      if (typeof bodyBookingId !== "string") {
        return errorResponse("booking_id must be a UUID string", "VALIDATION_ERROR", 400);
      }
      const { data: bookingRow } = await supabaseAdmin
        .from("bookings")
        .select("id, provider_id")
        .eq("id", bodyBookingId)
        .single();
      if (!bookingRow || bookingRow.provider_id !== providerId) {
        return errorResponse("Booking not found or does not belong to your provider", "VALIDATION_ERROR", 400);
      }
      bookingId = bookingRow.id;
    }

    const publishedAt = status === "published" ? new Date().toISOString() : null;

    const { data: post, error } = await supabaseAdmin
      .from("explore_posts")
      .insert({
        provider_id: providerId,
        created_by_user_id: user.id,
        caption: caption || null,
        media_urls,
        tags: sanitizedTags,
        primary_category_id: primary_category_id || null,
        offering_id: offering_id || null,
        status: status === "published" ? "published" : "draft",
        published_at: publishedAt,
      })
      .select(
        `
        id,
        provider_id,
        created_by_user_id,
        caption,
        media_urls,
        tags,
        status,
        published_at,
        like_count,
        comment_count,
        view_count,
        primary_category_id,
        offering_id,
        created_at,
        updated_at,
        providers:provider_id(business_name, slug)
      `
      )
      .single();

    if (error) {
      return handleApiError(error, "Failed to create post");
    }

    const postStatus = (post as any).status;
    if (postStatus === "published") {
      try {
        await supabaseAdmin.rpc("award_provider_points_for_explore_post", {
          p_provider_id: providerId,
          p_post_id: (post as any).id,
        });
      } catch (pointsError) {
        console.warn("[explore/posts] Award points for post after booking:", pointsError);
      }

      if (alsoAddToGallery === true && media_urls.length > 0) {
        try {
          const galleryUrl = toPublicMediaUrl(media_urls[0], supabaseUrl());
          await supabaseAdmin.rpc("append_provider_gallery", {
            p_provider_id: providerId,
            p_url: galleryUrl,
          });
        } catch (galleryError) {
          console.warn("[explore/posts] Also-add-to-gallery failed:", {
            providerId,
            postId: (post as any).id,
            bookingId,
            error: galleryError,
          });
        }
      }
    }

    let createdOffering: { id: string; name: string; price?: number; duration_minutes?: number } | null = null;
    if ((post as any).offering_id) {
      const { data: offRow } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .eq("id", (post as any).offering_id)
        .single();
      if (offRow) {
        createdOffering = { id: offRow.id, name: offRow.title ?? "", price: offRow.price != null ? Number(offRow.price) : undefined, duration_minutes: offRow.duration_minutes ?? undefined };
      }
    }
    const explorePost = mapToExplorePost(post, new Set(), new Set(), createdOffering);
    return successResponse(explorePost, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create post");
  }
}
