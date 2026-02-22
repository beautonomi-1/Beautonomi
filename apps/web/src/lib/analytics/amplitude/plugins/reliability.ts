/**
 * Reliability Plugin
 * Implements retry logic, offline queue, and event batching.
 * On flush, events are re-submitted to the Amplitude SDK with
 * exponential backoff (up to 3 retries). Events older than 7 days
 * are discarded automatically.
 */

import * as amplitude from "@amplitude/analytics-browser";
import { AmplitudePlugin, PluginContext } from "./types";
import { AmplitudeEvent } from "../types";

const QUEUE_KEY = "amplitude_event_queue";
const MAX_BATCH_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000; // 1 second base for exponential backoff
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class ReliabilityPlugin implements AmplitudePlugin {
  name = "reliability";
  private context: PluginContext;
  private queue: AmplitudeEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(context: PluginContext) {
    this.context = context;
    this.loadQueue();
    this.startFlushTimer();
  }

  execute(event: AmplitudeEvent): AmplitudeEvent {
    // Apply sampling rate
    if (this.context.config?.sampling_rate !== undefined) {
      const samplingRate = this.context.config.sampling_rate;
      if (samplingRate < 1.0 && Math.random() > samplingRate) {
        // Skip this event due to sampling
        return event;
      }
    }

    // Stamp the event time if not already set (used for staleness check)
    if (!event.time) {
      event.time = Date.now();
    }

    // Add to queue for batching
    this.queue.push(event);
    this.saveQueue();

    // Flush if batch is full
    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flushQueue();
    }

    return event;
  }

  private loadQueue() {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        const parsed: AmplitudeEvent[] = JSON.parse(stored);
        // Discard events older than 7 days on load
        const now = Date.now();
        this.queue = parsed.filter((event) => {
          const eventTime = event.time || 0;
          return now - eventTime < MAX_EVENT_AGE_MS;
        });
        // Persist the pruned queue
        if (parsed.length !== this.queue.length) {
          this.saveQueue();
        }
      }
    } catch (e) {
      console.error("[Amplitude Reliability] Failed to load queue:", e);
    }
  }

  private saveQueue() {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error("[Amplitude Reliability] Failed to save queue:", e);
    }
  }

  private startFlushTimer() {
    if (typeof window === "undefined") return;

    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flushQueue();
      }
    }, FLUSH_INTERVAL);
  }

  private async flushQueue() {
    if (this.queue.length === 0 || this.isFlushing) return;
    this.isFlushing = true;

    try {
      // Take a batch from the front of the queue
      const batch = this.queue.splice(0, MAX_BATCH_SIZE);
      this.saveQueue();

      // Filter out stale events (older than 7 days)
      const now = Date.now();
      const freshEvents = batch.filter((event) => {
        const eventTime = event.time || 0;
        return now - eventTime < MAX_EVENT_AGE_MS;
      });

      if (freshEvents.length === 0) {
        return;
      }

      // Attempt to submit each event with exponential backoff
      const failedEvents: AmplitudeEvent[] = [];

      for (const event of freshEvents) {
        const success = await this.submitWithRetry(event);
        if (!success) {
          failedEvents.push(event);
        }
      }

      // Put failed events back at the front of the queue for the next flush cycle
      if (failedEvents.length > 0) {
        this.queue.unshift(...failedEvents);
        this.saveQueue();
      }
    } catch (error) {
      console.error("[Amplitude Reliability] Flush error:", error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Submit a single event to Amplitude with exponential backoff.
   * Returns true on success, false if all retries exhausted.
   */
  private async submitWithRetry(event: AmplitudeEvent): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        amplitude.track(event.event_type, event.event_properties);
        return true;
      } catch (error) {
        console.warn(
          `[Amplitude Reliability] Retry ${attempt + 1}/${MAX_RETRIES} failed for "${event.event_type}":`,
          error
        );

        if (attempt < MAX_RETRIES - 1) {
          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
          await this.sleep(backoffMs);
        }
      }
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Persist any remaining events before teardown
    this.saveQueue();
  }
}
