import { twStyle } from "@/lib/twStyle";

describe("twStyle percentage heights", () => {
  it("parses max-h-[85%] as a percentage string", () => {
    expect(twStyle("max-h-[85%]")).toEqual({ maxHeight: "85%" });
  });

  it("parses min-h-[50%] as a percentage string", () => {
    expect(twStyle("min-h-[50%]")).toEqual({ minHeight: "50%" });
  });

  it("parses max-h-[90%] alongside other classes", () => {
    const style = twStyle("max-h-[90%] rounded-t-3xl bg-white");
    expect(style.maxHeight).toBe("90%");
    expect(style.borderTopLeftRadius).toBe(24);
    expect(style.borderTopRightRadius).toBe(24);
    expect(style.backgroundColor?.toLowerCase()).toBe("#ffffff");
  });

  it("parses rounded-t-xl", () => {
    const style = twStyle("rounded-t-xl");
    expect(style.borderTopLeftRadius).toBe(12);
    expect(style.borderTopRightRadius).toBe(12);
  });
});
