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
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    const fd = new FormData();
    const appendSpy = jest.spyOn(fd, "append");
    await appendUploadFile(fd, "files", {
      uri: "file:///tmp/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });
    expect(mockBytes).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith(
      "files",
      expect.any(Blob),
      "photo.jpg",
    );
    const blob = appendSpy.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("image/jpeg");
  });

  it("appends Blob with filename on web", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    const blob = new Blob(["x"], { type: "image/jpeg" });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(blob) }) as typeof fetch;
    const fd = new FormData();
    const appendSpy = jest.spyOn(fd, "append");
    await appendUploadFile(fd, "file", {
      uri: "blob:http://localhost/x",
      name: "photo.jpg",
      type: "image/jpeg",
    });
    expect(global.fetch).toHaveBeenCalledWith("blob:http://localhost/x");
    expect(appendSpy).toHaveBeenCalledWith("file", expect.any(Blob), "photo.jpg");
  });
});
