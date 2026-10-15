import { Platform } from "react-native";
import { appendUploadFile } from "@/lib/form-data-file";

const mockBytes = jest.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));

jest.mock("expo-file-system", () => ({
  File: jest.fn(function MockFile(this: { type: string }, uri: string) {
    this.type = "";
    return {
      uri,
      type: "",
      bytes: mockBytes,
    };
  }),
}));

describe("appendUploadFile", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
    mockBytes.mockClear();
  });

  it("appends typed Blob from file bytes on native", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    const fd = new FormData();
    const appendSpy = jest.spyOn(fd, "append");
    await appendUploadFile(fd, "file", {
      uri: "file:///tmp/x.png",
      name: "x.png",
      type: "image/png",
    });
    expect(mockBytes).toHaveBeenCalled();
    const blob = appendSpy.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("image/png");
  });
});
