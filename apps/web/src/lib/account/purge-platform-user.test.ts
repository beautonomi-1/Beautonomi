import { beforeEach, describe, expect, it, vi } from "vitest";
import { purgePlatformUserAccountFully } from "./purge-platform-user";

const mockPurgeUserMessageAttachmentFiles = vi.fn();

vi.mock("@/lib/account/purge-user-message-files", () => ({
  purgeUserMessageAttachmentFiles: (...args: unknown[]) =>
    mockPurgeUserMessageAttachmentFiles(...args),
}));

function buildAdminClient(opts: {
  clearError?: { message: string; code?: string } | null;
  deleteError?: { message: string; code?: string } | null;
}) {
  const calls: string[] = [];
  const admin = {
    rpc: vi.fn(async () => {
      calls.push("rpc");
      return { data: null, error: opts.clearError ?? null };
    }),
    auth: {
      admin: {
        deleteUser: vi.fn(async () => {
          calls.push("deleteUser");
          return { data: null, error: opts.deleteError ?? null };
        }),
      },
    },
  };

  mockPurgeUserMessageAttachmentFiles.mockImplementationOnce(async () => {
    calls.push("storage");
    return { removed: 2 };
  });

  return { admin, calls };
}

describe("purgePlatformUserAccountFully", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears DB blockers and storage attachments before deleting the auth user", async () => {
    const { admin, calls } = buildAdminClient({});

    const result = await purgePlatformUserAccountFully(admin as any, "user-id");

    expect(result).toEqual({ ok: true, storage_attachments_removed: 2 });
    expect(admin.rpc).toHaveBeenCalledWith("compliance_clear_user_references", {
      p_user_id: "user-id",
    });
    expect(mockPurgeUserMessageAttachmentFiles).toHaveBeenCalledWith(admin, "user-id");
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-id");
    expect(calls).toEqual(["rpc", "storage", "deleteUser"]);
  });

  it("stops before storage and auth deletion when DB cleanup fails", async () => {
    const { admin } = buildAdminClient({
      clearError: { message: "permission denied", code: "42501" },
    });

    const result = await purgePlatformUserAccountFully(admin as any, "user-id");

    expect(result).toEqual({ ok: false, message: "permission denied", code: "42501" });
    expect(mockPurgeUserMessageAttachmentFiles).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("maps Supabase Auth database delete failures to a stable code", async () => {
    const { admin } = buildAdminClient({
      deleteError: { message: "Database error deleting user" },
    });

    const result = await purgePlatformUserAccountFully(admin as any, "user-id");

    expect(result).toEqual({
      ok: false,
      message: "Database error deleting user",
      code: "AUTH_DELETE_DATABASE_ERROR",
    });
  });
});
