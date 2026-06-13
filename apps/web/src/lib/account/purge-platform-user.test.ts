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
  publicDeleteError?: { message: string; code?: string } | null;
  blockersAfterClear?: unknown[];
}) {
  const calls: string[] = [];
  const admin = {
    rpc: vi.fn(async (name: string) => {
      calls.push(`rpc:${name}`);
      if (name === "compliance_clear_user_references") {
        return { data: null, error: opts.clearError ?? null };
      }
      if (name === "compliance_diagnose_user_delete_blockers") {
        return { data: opts.blockersAfterClear ?? [], error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table !== "users") {
        throw new Error(`unexpected from(${table})`);
      }
      return {
        delete: vi.fn(() => ({
          eq: vi.fn(async () => {
            calls.push("users.delete");
            return { error: opts.publicDeleteError ?? null };
          }),
        })),
      };
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
    expect(calls).toEqual([
      "rpc:compliance_clear_user_references",
      "rpc:compliance_diagnose_user_delete_blockers",
      "storage",
      "users.delete",
      "deleteUser",
    ]);
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

  it("stops before auth delete when diagnose reports blockers after cleanup", async () => {
    const { admin } = buildAdminClient({
      blockersAfterClear: [
        {
          table_schema: "public",
          table_name: "ai_cache",
          column_name: "provider_id",
          constraint_name: "ai_cache_provider_id_fkey",
          delete_action: "NO ACTION",
          blocking_rows: 2,
        },
      ],
    });

    const result = await purgePlatformUserAccountFully(admin as any, "user-id");

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("PURGE_FK_BLOCKERS_REMAIN");
      expect(result.message).toContain("ai_cache");
    }
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
