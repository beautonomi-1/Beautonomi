import type { Map } from "mapbox-gl";

/**
 * Keeps a Mapbox GL canvas sized correctly when the container lives in flex layouts,
 * dialogs, or sidebars (common 0×0 canvas bug). Call right after creating the map.
 */
export function attachMapResize(map: Map, container: HTMLElement): () => void {
  const bump = () => {
    try {
      map.resize();
    } catch {
      /* ignore */
    }
  };

  const scheduleAfterLayout = () => {
    bump();
    requestAnimationFrame(() => {
      bump();
      requestAnimationFrame(bump);
    });
  };

  if (map.loaded()) scheduleAfterLayout();
  else map.once("load", scheduleAfterLayout);

  const ro = new ResizeObserver(() => bump());
  ro.observe(container);
  window.addEventListener("resize", bump);

  return () => {
    ro.disconnect();
    window.removeEventListener("resize", bump);
  };
}

const DEFAULT_STATIC_STYLE_PATH = "mapbox/streets-v12";

/** Style path segment for Mapbox Static Images API (`/styles/v1/{path}/static/...`). */
export function mapboxStyleUrlToStaticStylePath(styleUrl: string | null | undefined): string {
  if (!styleUrl?.trim()) return DEFAULT_STATIC_STYLE_PATH;
  const m = styleUrl.trim().match(/mapbox:\/\/styles\/(.+)/);
  return m?.[1]?.trim() ? m[1].trim() : DEFAULT_STATIC_STYLE_PATH;
}
