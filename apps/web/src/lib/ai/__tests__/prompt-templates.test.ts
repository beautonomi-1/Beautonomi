import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

import { clearPromptTemplateCache, loadPromptTemplate } from "../prompt-templates";

function supabaseWithRow(row: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const from = vi.fn(() => chain);
  return { client: { from }, from, chain };
}

describe("loadPromptTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPromptTemplateCache();
  });

  it("loads the enabled template for the feature key and exposes its output_schema", async () => {
    const { client, chain } = supabaseWithRow({
      key: "ai.provider.content_studio",
      version: 3,
      enabled: true,
      template: "Write 3 captions.",
      system_instructions: "You are a social assistant.",
      output_schema: { type: "object", properties: { post_captions: { type: "array" } } },
    });
    mockGetSupabaseAdmin.mockReturnValue(client);

    const tpl = await loadPromptTemplate("ai.provider.content_studio");
    expect(tpl).toMatchObject({
      key: "ai.provider.content_studio",
      version: 3,
      system: "You are a social assistant.",
      userPrompt: "Write 3 captions.",
      source: "db",
    });
    expect(tpl?.outputSchema).toEqual({ type: "object", properties: { post_captions: { type: "array" } } });
    expect(chain.eq).toHaveBeenCalledWith("key", "ai.provider.content_studio");
    expect(chain.eq).toHaveBeenCalledWith("enabled", true);
    expect(chain.order).toHaveBeenCalledWith("version", { ascending: false });
  });

  it("returns null outputSchema for an empty {} schema and null when no row exists", async () => {
    const { client } = supabaseWithRow({
      key: "ai.provider.profile_completion",
      version: 1,
      template: "Suggest improvements.",
      system_instructions: "",
      output_schema: {},
    });
    mockGetSupabaseAdmin.mockReturnValue(client);
    const tpl = await loadPromptTemplate("ai.provider.profile_completion");
    expect(tpl?.outputSchema).toBeNull();

    clearPromptTemplateCache();
    mockGetSupabaseAdmin.mockReturnValue(supabaseWithRow(null).client);
    expect(await loadPromptTemplate("ai.provider.profile_completion")).toBeNull();
  });

  it("caches per feature key for 5 minutes (second call does not hit the DB)", async () => {
    const { client, from } = supabaseWithRow({
      key: "ai.provider.content_studio",
      version: 1,
      template: "t",
      system_instructions: "s",
      output_schema: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(client);

    const first = await loadPromptTemplate("ai.provider.content_studio");
    const second = await loadPromptTemplate("ai.provider.content_studio");
    expect(second).toBe(first);
    expect(from).toHaveBeenCalledTimes(1);

    // Negative results are cached too.
    mockGetSupabaseAdmin.mockReturnValue(supabaseWithRow(null).client);
    await loadPromptTemplate("ai.provider.profile_completion");
    await loadPromptTemplate("ai.provider.profile_completion");
    expect(mockGetSupabaseAdmin).toHaveBeenCalledTimes(2);
  });
});
