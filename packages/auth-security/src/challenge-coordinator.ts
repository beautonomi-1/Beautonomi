import type { SecurityChallengeCode, SecurityChallengeDetails } from "./error-codes";

export type PendingSecurityChallenge = {
  code: SecurityChallengeCode;
  message: string;
  details?: SecurityChallengeDetails;
};

type Resolver = (completed: boolean) => void;

let pending: PendingSecurityChallenge | null = null;
let resolvers: Resolver[] = [];

/** Client-side: merge parallel 403 security challenges into one UI prompt. */
export function createChallengeCoordinator() {
  return {
    notify(challenge: PendingSecurityChallenge): Promise<boolean> {
      if (!pending) {
        pending = challenge;
      }
      return new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    },
    peek(): PendingSecurityChallenge | null {
      return pending;
    },
    complete(success: boolean) {
      const list = resolvers;
      resolvers = [];
      pending = null;
      for (const r of list) r(success);
    },
    reset() {
      pending = null;
      resolvers = [];
    },
  };
}

export type ChallengeCoordinator = ReturnType<typeof createChallengeCoordinator>;

export type SecurityChallengeHandler = (
  challenge: PendingSecurityChallenge,
) => Promise<boolean>;

const defaultCoordinator = createChallengeCoordinator();
let registeredHandler: SecurityChallengeHandler | null = null;

/** Web / mobile: attach UI that resolves security challenges (403 retry). */
export function registerSecurityChallengeHandler(handler: SecurityChallengeHandler | null): void {
  registeredHandler = handler;
}

export function getDefaultChallengeCoordinator(): ChallengeCoordinator {
  return defaultCoordinator;
}

let inFlight: Promise<boolean> | null = null;

/**
 * Invoked by HTTP clients when the API returns a security challenge. Parallel challenges share
 * one prompt; resolves false immediately when no UI is mounted (callers surface the error).
 */
export function dispatchSecurityChallenge(challenge: PendingSecurityChallenge): Promise<boolean> {
  const handler = registeredHandler;
  if (!handler) return Promise.resolve(false);
  if (inFlight) return inFlight;
  inFlight = handler(challenge)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
