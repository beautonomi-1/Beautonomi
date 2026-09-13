/**
 * Explore post embeddings (pgvector). Written on publish/unhide; deleted on hide/delete.
 */
import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

type EmbeddingBackend = "gateway" | "openai" | "gemini";

async function resolveEmbeddingModel(
  environment: string,
): Promise<{ modelId: string; apiKey: string; backend: EmbeddingBackend }> {
  const resolved = await resolveAiRuntime(environment, null);
  if (resolved.emergency.disableEmbeddings) {
    throw new Error("embeddings_disabled");
  }
  const row = resolved.catalog.find(
    (c) => c.enabled && (/\/text-embedding|embedding/i.test(c.id) || c.id.includes("embedding")),
  );
  if (resolved.config.gatewayApiKey) {
    return {
      modelId: row?.id ?? DEFAULT_EMBEDDING_MODEL,
      apiKey: resolved.config.gatewayApiKey,
      backend: "gateway",
    };
  }
  if (resolved.config.openaiApiKey) {
    return {
      modelId: "text-embedding-3-small",
      apiKey: resolved.config.openaiApiKey,
      backend: "openai",
    };
  }
  if (resolved.config.geminiApiKey) {
    return { modelId: "text-embedding-004", apiKey: resolved.config.geminiApiKey, backend: "gemini" };
  }
  throw new Error("embedding_not_configured");
}

export async function embedText(text: string, environment: string): Promise<number[]> {
  const { modelId, apiKey, backend } = await resolveEmbeddingModel(environment);

  if (backend === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey });
    const result = await embed({
      model: google.textEmbeddingModel(modelId),
      value: text.slice(0, 8000),
    });
    return padOrTruncateEmbedding(result.embedding, EMBEDDING_DIMENSIONS);
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: backend === "gateway" ? "https://ai-gateway.vercel.sh/v1" : undefined,
  });
  const bareId = modelId.replace(/^openai\//, "");
  const result = await embed({
    model: openai.embedding(bareId),
    value: text.slice(0, 8000),
  });
  return result.embedding;
}

/** Pad shorter embeddings (e.g. Gemini 768) to pgvector column width. */
function padOrTruncateEmbedding(values: number[], dimensions: number): number[] {
  if (values.length === dimensions) return values;
  if (values.length > dimensions) return values.slice(0, dimensions);
  return [...values, ...new Array(dimensions - values.length).fill(0)];
}

export async function upsertPostEmbedding(postId: string, caption: string, environment: string): Promise<void> {
  const embedding = await embedText(caption || " ", environment);
  const supabase = getSupabaseAdmin();
  const { modelId } = await resolveEmbeddingModel(environment);
  await supabase.from("explore_post_embeddings").upsert(
    {
      post_id: postId,
      model_id: modelId,
      embedding,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "post_id" },
  );
}

export async function deletePostEmbedding(postId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("explore_post_embeddings").delete().eq("post_id", postId);
}

export async function fetchSimilarPosts(
  postId: string,
  caption: string,
  limit = 12,
  environment = "production",
): Promise<Array<{ post_id: string; distance: number }>> {
  const embedding = await embedText(caption, environment);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("explore_match_posts", {
    p_query_embedding: embedding,
    p_limit: limit,
    p_exclude_id: postId,
  });
  if (error) return [];
  return (data ?? []) as Array<{ post_id: string; distance: number }>;
}
