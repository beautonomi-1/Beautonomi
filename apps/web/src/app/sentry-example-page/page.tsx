"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

/**
 * Sentry test page. Visit /sentry-example-page and click a button to send
 * a test error to Sentry (org: beautonomi, project: web-nextjs).
 * Or visit /sentry-example-page?trigger=1 to trigger on load.
 */
const TEST_MESSAGE = "Beautonomi Sentry test - web-nextjs";

async function sendTestToSentry() {
  Sentry.captureException(new Error(TEST_MESSAGE), {
    tags: { source: "sentry-example-page" },
  });
  await Sentry.flush(2000);
}

function triggerUncaughtError() {
  // Intentionally call undefined to trigger an uncaught error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).myUndefinedFunction();
}

export default function SentryExamplePage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverStatus, setServerStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [eventId, setEventId] = useState<string | null>(null);
  const [serverEventId, setServerEventId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("trigger") === "1") {
      setStatus("sending");
      sendTestToSentry()
        .then(() => setStatus("sent"))
        .catch(() => setStatus("error"));
    }
  }, [searchParams]);

  const onCaptureClick = async () => {
    setStatus("sending");
    try {
      const id = Sentry.captureException(new Error(TEST_MESSAGE), {
        tags: { source: "sentry-example-page" },
      });
      setEventId(id ?? null);
      await Sentry.flush(2000);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const onUncaughtClick = () => {
    setStatus("sent");
    triggerUncaughtError();
  };

  const onServerTestClick = async () => {
    setServerStatus("sending");
    setServerEventId(null);
    try {
      const res = await fetch("/api/sentry-test");
      const data = await res.json();
      if (!res.ok) {
        setServerStatus("error");
        return;
      }
      setServerEventId(data.eventId ?? null);
      setServerStatus("sent");
    } catch {
      setServerStatus("error");
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 py-12 space-y-6">
      <h1 className="text-2xl font-semibold">Sentry test page</h1>
      <p className="text-muted-foreground">
        Send a test error to Sentry (beautonomi / web-nextjs). Check{" "}
        <a
          href="https://sentry.io/organizations/beautonomi/issues/?project=4510963809452112"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          Sentry → Issues
        </a>
        .
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onServerTestClick}
          disabled={serverStatus === "sending"}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {serverStatus === "sending" ? "Sending…" : "Send test from server (recommended)"}
        </button>
        <p className="text-xs text-muted-foreground">
          Uses the server’s SENTRY_DSN. If this shows up in Sentry, your project is connected.
        </p>
        <button
          type="button"
          onClick={onCaptureClick}
          disabled={status === "sending"}
          className="rounded-md border border-input bg-background px-4 py-2 hover:bg-accent disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send test from browser (client)"}
        </button>
        <button
          type="button"
          onClick={onUncaughtClick}
          className="rounded-md border border-input bg-background px-4 py-2 hover:bg-accent"
        >
          Trigger uncaught error (myUndefinedFunction)
        </button>
      </div>

      {(status === "sent" || serverStatus === "sent") && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Event sent. {eventId && `Client event ID: ${eventId}. `}
          {serverEventId && `Server event ID: ${serverEventId}. `}
          Refresh Sentry Issues in a few seconds.
        </p>
      )}
      {(status === "error" || serverStatus === "error") && (
        <p className="text-sm text-destructive">Failed to send. Check console and steps below.</p>
      )}

      <div className="mt-8 rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">If issues don’t appear in Sentry:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Restart the dev server (NEXT_PUBLIC_* is set at startup).</li>
          <li>Clear build cache: <code className="bg-muted px-1">cd apps/web && pnpm clean && pnpm dev</code>.</li>
          <li>In browser DevTools → Network, filter by &quot;sentry&quot; or &quot;ingest&quot;; you should see a request to ingest.de.sentry.io after clicking.</li>
          <li>Run <code className="bg-muted px-1">node scripts/check-sentry-env.mjs</code> in apps/web to verify env vars.</li>
        </ol>
      </div>
    </div>
  );
}
