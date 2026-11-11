import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const catalog = fs.readFileSync(path.resolve(__dirname, "../route.ts"), "utf8");
const item = fs.readFileSync(path.resolve(__dirname, "../[id]/route.ts"), "utf8");

describe("time-off-types catalog writes (F3-16)", () => {
  it("POST answers 501 instead of a 409 conflict", () => {
    expect(catalog).toMatch(/NOT_SUPPORTED[\s\S]{0,40}501/);
    expect(catalog).not.toMatch(/NOT_SUPPORTED[\s\S]{0,40}409/);
  });

  it("PATCH/DELETE answer 501 instead of a 409 conflict", () => {
    expect(item).toMatch(/NOT_SUPPORTED[\s\S]{0,40}501/);
    expect(item).not.toMatch(/NOT_SUPPORTED[\s\S]{0,40}409/);
  });
});
