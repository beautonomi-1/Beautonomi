/** Minimal typings so DTS builds without @types/node (Vercel/prod installs). */
declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(data: string): {
      digest(encoding: "hex" | "base64" | string): string;
    };
  };
}
