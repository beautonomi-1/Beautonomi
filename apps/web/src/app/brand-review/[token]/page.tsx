"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function BrandReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [subject, setSubject] = useState<{ subject_type: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetch(`/api/public/brand-review/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error.message ?? "Invalid link");
        else setSubject(j.data);
      })
      .catch(() => setError("Could not load review"));
  }, [token]);

  async function submit(decision: "approved" | "changes_requested" | "rejected") {
    const res = await fetch(`/api/public/brand-review/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment, reviewer_name: name }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error?.message ?? "Failed");
      return;
    }
    setDone(true);
  }

  if (error) return <main className="mx-auto max-w-md p-6 text-sm text-red-700">{error}</main>;
  if (!subject) return <main className="mx-auto max-w-md p-6 text-sm">Loading…</main>;
  if (done) return <main className="mx-auto max-w-md p-6 text-sm">Thank you — your decision was recorded.</main>;

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Brand review</h1>
      <p className="text-sm text-zinc-600">
        {subject.subject_type.replace(/_/g, " ")} · status: {subject.status}
      </p>
      <label className="block text-sm">
        Your name
        <input className="mt-1 w-full rounded border px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        Comment
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white" disabled={!name.trim()} onClick={() => void submit("approved")}>
          Approve
        </button>
        <button type="button" className="rounded border px-3 py-1.5 text-sm" disabled={!name.trim()} onClick={() => void submit("changes_requested")}>
          Request changes
        </button>
        <button type="button" className="rounded border px-3 py-1.5 text-sm" disabled={!name.trim()} onClick={() => void submit("rejected")}>
          Reject
        </button>
      </div>
    </main>
  );
}
