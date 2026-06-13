import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("687_chat_realtime_publication migration", () => {
  it("adds conversations and messages to supabase_realtime", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "../../supabase/migrations/687_chat_realtime_publication.sql"),
      "utf8",
    );
    expect(sql).toContain("ALTER TABLE public.conversations REPLICA IDENTITY FULL");
    expect(sql).toContain("ALTER TABLE public.messages REPLICA IDENTITY FULL");
    expect(sql).toContain("ADD TABLE public.conversations");
    expect(sql).toContain("ADD TABLE public.messages");
  });
});
