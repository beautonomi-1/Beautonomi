import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";

type Channel = "push" | "sms" | "email";
type RecipientType = "all_users" | "all_providers" | "custom";

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BroadcastComposePage() {
  useAdminDocumentTitle("Compose Broadcast");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [channel, setChannel] = useState<Channel>("push");
  const [recipientType, setRecipientType] = useState<RecipientType>("all_users");
  const [customIds, setCustomIds] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const user_ids = recipientType === "custom" ? parseUserIds(customIds) : undefined;
      if (recipientType === "custom" && (!user_ids || user_ids.length === 0)) {
        throw new Error("Add at least one user ID for a custom audience.");
      }
      if (!message.trim()) {
        throw new Error("Message / body is required.");
      }
      if (channel === "push") {
        if (!title.trim()) throw new Error("Push notifications require a title.");
        return adminApi.postJson<{ message?: string }>("/api/admin/broadcast/push", {
          title: title.trim(),
          message: message.trim(),
          recipient_type: recipientType,
          user_ids,
          url: url.trim() || undefined,
        });
      }
      if (channel === "sms") {
        return adminApi.postJson<{ message?: string }>("/api/admin/broadcast/sms", {
          message: message.trim(),
          recipient_type: recipientType,
          user_ids,
        });
      }
      if (!subject.trim()) throw new Error("Email broadcasts require a subject line.");
      return adminApi.postJson<{ message?: string }>("/api/admin/broadcast/email", {
        subject: subject.trim(),
        message: message.trim(),
        recipient_type: recipientType,
        user_ids,
      });
    },
    onSuccess: (res) => {
      const r = res as { recipients?: number; message?: string };
      if (typeof r.recipients === "number") setStatus(`Queued for ${r.recipients} recipients.`);
      else if (typeof r.message === "string") setStatus(r.message);
      else setStatus("Sent.");
    },
    onError: (e: Error) => setStatus(e.message),
  });

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Compose broadcast"
        description="Send push, SMS, or email via the admin broadcast APIs. Delivery is logged to broadcast history."
      />
      <p className="text-sm text-gray-600">
        <Link to={adminSpaTo("/admin/broadcast/history")} className="font-medium text-primary underline">
          View delivery history →
        </Link>
      </p>

      <AdminPanel>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600">Channel</label>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="push">Push</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Audience</label>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as RecipientType)}
            >
              <option value="all_users">All customers</option>
              <option value="all_providers">All providers (tenant)</option>
              <option value="custom">Custom user IDs</option>
            </select>
          </div>

          {recipientType === "custom" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">User IDs (comma or whitespace separated)</label>
              <textarea
                className="mt-1 w-full min-h-[88px] rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                value={customIds}
                onChange={(e) => setCustomIds(e.target.value)}
                placeholder="uuid-one, uuid-two"
              />
            </div>
          ) : null}

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Title</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          ) : null}

          {channel === "email" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Subject</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-gray-600">{channel === "push" ? "Message" : "Body / message"}</label>
            <textarea
              className="mt-1 w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {channel === "push" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Deep link URL (optional)</label>
              <input
                className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          ) : null}

          {status ? (
            <p className={`text-sm ${status.includes("Error") || m.isError ? "text-red-600" : "text-gray-700"}`}>{status}</p>
          ) : null}

          <button
            type="button"
            className={adminToolbarButtonClass(m.isPending)}
            disabled={m.isPending}
            onClick={() => {
              setStatus(null);
              void m.mutate();
            }}
          >
            {m.isPending ? "Sending…" : "Send broadcast"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
