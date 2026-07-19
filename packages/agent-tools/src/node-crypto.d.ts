/** Minimal typings so DTS builds without @types/node (Vercel/prod installs). */
declare module "node:crypto" {
  export function randomUUID(): string;
}
