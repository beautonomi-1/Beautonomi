/**
 * Vitest runs outside the Next.js RSC server graph; the real `server-only`
 * package throws on import. Route modules that `import "server-only"` are
 * aliased to this file in vitest.config.ts so tests can load server code.
 */
