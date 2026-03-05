/**
 * Convert YouTube or Vimeo watch URL to embed URL for iframe.
 * Supports youtube.com/watch?v=, youtu.be/, vimeo.com/123, vimeo.com/channels/xxx/123
 */
export function getVideoEmbedUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // YouTube: watch?v=ID or youtu.be/ID
  const ytWatch = trimmed.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}?autoplay=0`;
  const ytShort = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}?autoplay=0`;
  if (trimmed.includes("youtube.com/embed/")) return trimmed;

  // Vimeo: vimeo.com/123 or player.vimeo.com/video/123
  const vimeo = trimmed.match(/(?:vimeo\.com\/)(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (trimmed.includes("player.vimeo.com/video/")) return trimmed;

  return null;
}
