import { describe, expect, it } from "vitest";
import { buildDefaultModelPickerOptions, countEnabledLiveModels } from "../catalogModels";

describe("catalogModels", () => {
  it("returns all live chat/vision gateway models for vercel_gateway", () => {
    const options = buildDefaultModelPickerOptions({
      runtime: "vercel_gateway",
      liveModels: [
        {
          id: "openai/gpt-4.1-mini",
          name: "GPT-4.1 Mini",
          provider: "openai",
          capability: "chat",
          tier: "flash",
          enabled: false,
          db_id: null,
          eval_passed_at: null,
          input_usd_per_1k: 0,
          output_usd_per_1k: 0,
        },
        {
          id: "openai/text-embedding-3-small",
          name: "Embed",
          provider: "openai",
          capability: "embedding",
          tier: "lite",
          enabled: true,
          db_id: null,
          eval_passed_at: null,
          input_usd_per_1k: 0,
          output_usd_per_1k: 0,
        },
      ],
      directGeminiModels: [
        { id: "gemini-2.5-flash-lite", provider: "gemini", tier: "lite", enabled: true, gateway: false },
      ],
      selectableModels: [],
    });
    expect(options).toHaveLength(1);
    expect(options[0].model_id).toBe("openai/gpt-4.1-mini");
    expect(options[0].catalog_enabled).toBe(false);
  });

  it("defaults catalog enabled-only off when no models enabled", () => {
    expect(countEnabledLiveModels([{ enabled: false } as never, { enabled: false } as never])).toBe(0);
  });
});
