import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * §custom-request-upload-tests 2026-05: lock in the contract expected by the
 * customer mobile app — the upload route must:
 *  - Reject empty / oversized / unsupported uploads with structured errors.
 *  - Tolerate per-file storage failures and surface a `partial: true` flag
 *    when at least one file uploaded.
 *  - Return 500 only when *no* files uploaded.
 */

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetStorageServiceClientOrUser = vi.fn();
const mockHasSupabaseStorageServiceRole = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/storage-service-client", () => ({
  getStorageServiceClientOrUser: (...args: unknown[]) =>
    mockGetStorageServiceClientOrUser(...args),
  hasSupabaseStorageServiceRole: () => mockHasSupabaseStorageServiceRole(),
}));

function fakeFile(opts: {
  name: string;
  type: string;
  size?: number;
  bytes?: Uint8Array;
}): File {
  // jsdom doesn't expose `File.prototype.arrayBuffer`, so build a minimal stub
  // with the surface the route actually reads (name/type/size/arrayBuffer).
  // This keeps the test focused on validation + storage interactions without
  // needing a full DOM File polyfill.
  const size = opts.size ?? 1024;
  const buffer = opts.bytes ? opts.bytes.buffer : new ArrayBuffer(size);
  const file = {
    name: opts.name,
    type: opts.type,
    size: opts.bytes ? opts.bytes.byteLength : size,
    arrayBuffer: async () => buffer,
    slice: () => file,
    stream: () => undefined,
    text: async () => "",
    lastModified: Date.now(),
  } as unknown as File;
  return file;
}

function buildRequestWithFiles(files: File[]): NextRequest {
  // The real route only calls `formData.getAll("files")`; stub a minimal
  // FormData-like with that shape so we don't have to round-trip through
  // jsdom's FormData (which doesn't preserve our hand-rolled File stubs).
  const fakeFormData = {
    getAll: (name: string) => (name === "files" ? files : []),
  } as unknown as FormData;
  const req = new NextRequest("http://localhost/api/me/custom-requests/upload", {
    method: "POST",
  });
  Object.defineProperty(req, "formData", { value: async () => fakeFormData });
  return req;
}

interface UploadStub {
  upload: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
}

function makeStorageStub(opts: {
  uploadResults?: Array<{ error: { message: string } | null }>;
  publicUrlPrefix?: string;
}): { storage: { from: (bucket: string) => UploadStub } } {
  const uploadResults = opts.uploadResults ?? [];
  const upload = vi.fn().mockImplementation(async () => {
    if (uploadResults.length === 0) return { data: null, error: null };
    return uploadResults.shift();
  });
  const getPublicUrl = vi.fn().mockImplementation((path: string) => ({
    data: { publicUrl: `${opts.publicUrlPrefix ?? "https://files.test/"}${path}` },
  }));
  return {
    storage: {
      from: () => ({ upload, getPublicUrl }),
    },
  };
}

describe("POST /api/me/custom-requests/upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockGetSupabaseServer.mockResolvedValue({});
    mockHasSupabaseStorageServiceRole.mockReturnValue(false);
  });

  it("rejects when no files are provided", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(makeStorageStub({}));
    const { POST } = await import("../route");
    const req = buildRequestWithFiles([]);
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unsupported MIME types with a structured error", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(makeStorageStub({}));
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "doc.pdf", type: "application/pdf", size: 1024 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects files over 5MB with FILE_TOO_LARGE", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(makeStorageStub({}));
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "big.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects empty files with VALIDATION_ERROR", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(makeStorageStub({}));
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "empty.jpg", type: "image/jpeg", size: 0 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 UPLOAD_ERROR when every storage upload fails", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(
      makeStorageStub({
        uploadResults: [{ error: { message: "bucket not found" } }],
      }),
    );
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "ok.jpg", type: "image/jpeg", size: 1024 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("UPLOAD_ERROR");
  });

  it("returns partial success when only some files upload", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(
      makeStorageStub({
        uploadResults: [{ error: null }, { error: { message: "io error" } }],
        publicUrlPrefix: "https://cdn.test/",
      }),
    );
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "one.jpg", type: "image/jpeg", size: 1024 }),
        fakeFile({ name: "two.jpg", type: "image/jpeg", size: 2048 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.urls).toHaveLength(1);
    expect(body.data.partial).toBe(true);
    expect(body.data.requested).toBe(2);
    expect(body.data.failed).toEqual([expect.objectContaining({ name: "two.jpg" })]);
  });

  it("returns full success with partial=false when all files upload", async () => {
    mockGetStorageServiceClientOrUser.mockReturnValue(
      makeStorageStub({
        uploadResults: [{ error: null }],
        publicUrlPrefix: "https://cdn.test/",
      }),
    );
    const { POST } = await import("../route");
    const res = await POST(
      buildRequestWithFiles([
        fakeFile({ name: "ok.png", type: "image/png", size: 4096 }),
      ]),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.urls).toHaveLength(1);
    expect(body.data.partial).toBe(false);
    expect(body.data.count).toBe(1);
  });
});
