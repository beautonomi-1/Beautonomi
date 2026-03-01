import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const TEST_MESSAGE = "Beautonomi Sentry test (server) - web-nextjs";

/**
 * GET /api/sentry-test
 * Sends a test error from the server to Sentry. Uses SENTRY_DSN (server env).
 * If this event appears in Sentry, your DSN and project are correct.
 */
export async function GET() {
  const dsnSet = !!process.env.SENTRY_DSN;
  if (!dsnSet) {
    return NextResponse.json(
      { ok: false, error: "SENTRY_DSN not set on server" },
      { status: 500 }
    );
  }

  try {
    const eventId = Sentry.captureException(new Error(TEST_MESSAGE), {
      tags: { source: "api/sentry-test", runtime: "server" },
    });
    await Sentry.flush(2000);
    return NextResponse.json({ ok: true, eventId: eventId ?? null });
  } catch (err) {
    console.error("Sentry test failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
