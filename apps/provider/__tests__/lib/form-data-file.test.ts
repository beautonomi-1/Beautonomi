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

jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: jest.fn(),
}));

describe("appendUploadFile", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOS });
    mockBytes.mockClear();
  });

  it("appends expo/fetch bytes part from file bytes on native", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    const fd = new FormData();
    const appendSpy = jest.spyOn(fd, "append").mockImplementation(() => undefined);
    await appendUploadFile(fd, "file", {
      uri: "file:///tmp/x.png",
      name: "x.png",
      type: "image/png",
    });
    expect(mockBytes).toHaveBeenCalled();
    const part = appendSpy.mock.calls[0]?.[1] as {
      uri?: string;
      bytes?: () => Promise<Uint8Array>;
      type?: string;
    };
    expect(part.uri).toBe("file:///tmp/x.png");
    expect(part.type).toBe("image/png");
    await expect(part.bytes?.()).resolves.toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });
});
