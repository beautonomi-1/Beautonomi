/**
 * ID helpers
 */

export function generateId(length = 12): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
