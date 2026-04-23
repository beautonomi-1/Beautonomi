import { describe, it, expect, vi } from "vitest";
import { appendFormDataFileNative } from "../formDataFileNative";

describe("appendFormDataFileNative", () => {
  it("calls FormData.append with the field name and file part", () => {
    const fd = new FormData();
    const spy = vi.spyOn(fd, "append");
    appendFormDataFileNative(fd, "file", {
      uri: "file:///tmp/x.jpg",
      name: "x.jpg",
      type: "image/jpeg",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      "file",
      expect.objectContaining({
        uri: "file:///tmp/x.jpg",
        name: "x.jpg",
        type: "image/jpeg",
      })
    );
  });
});
