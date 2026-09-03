/**
 * Admin IP allowlist (`platform_settings.settings.security.admin_ip_allowlist`).
 *
 * Enforced from `proxy.ts` for `/admin*` and `/api/admin*`. An empty / missing list
 * disables the check. Entries may be exact IPv4/IPv6 addresses or CIDR ranges
 * (`196.25.0.0/16`, `2001:db8::/32`).
 *
 * The middleware has no Supabase client, so the list is read via PostgREST with the
 * service role key and cached in-process for 60s. Read failures fail OPEN (logged):
 * a DB hiccup must not lock every admin out; the role/MFA/session checks still apply.
 */
import { NextResponse, type NextRequest } from "next/server";

const CACHE_TTL_MS = 60_000;
let cache: { list: string[]; fetchedAt: number } | null = null;

export function __resetAdminIpAllowlistCacheForTests(): void {
  cache = null;
}

export function extractClientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const real = headers.get("x-real-ip");
  if (real) return normalizeIp(real);
  return null;
}

function normalizeIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  // IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  // strip :port from IPv4
  const v4port = ip.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  if (v4port) return v4port[1];
  return ip.toLowerCase();
}

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

function parseIpv6(ip: string): bigint | null {
  if (!ip.includes(":")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const expand = (s: string) => (s === "" ? [] : s.split(":"));
  let head = expand(halves[0]);
  let tail = halves.length === 2 ? expand(halves[1]) : [];
  // embedded IPv4 in the last group
  const last = (tail.length ? tail : head)[(tail.length ? tail : head).length - 1];
  if (last && last.includes(".")) {
    const v4 = parseIpv4(last);
    if (v4 === null) return null;
    const hi = ((v4 >> 16n) & 0xffffn).toString(16);
    const lo = (v4 & 0xffffn).toString(16);
    if (tail.length) tail = [...tail.slice(0, -1), hi, lo];
    else head = [...head.slice(0, -1), hi, lo];
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

type ParsedNet = { family: 4 | 6; addr: bigint; bits: number };

function parseEntry(entry: string): ParsedNet | null {
  const [ipPart, prefixPart] = entry.trim().split("/");
  const v4 = parseIpv4(ipPart);
  if (v4 !== null) {
    const bits = prefixPart === undefined ? 32 : Number(prefixPart);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
    return { family: 4, addr: v4, bits };
  }
  const v6 = parseIpv6(ipPart.toLowerCase());
  if (v6 !== null) {
    const bits = prefixPart === undefined ? 128 : Number(prefixPart);
    if (!Number.isInteger(bits) || bits < 0 || bits > 128) return null;
    return { family: 6, addr: v6, bits };
  }
  return null;
}

/** True when `entry` is a syntactically valid IP or CIDR. */
export function isValidAllowlistEntry(entry: string): boolean {
  return parseEntry(entry) !== null;
}

export function ipMatchesEntry(ip: string, entry: string): boolean {
  const net = parseEntry(entry);
  if (!net) return false;
  const addr = net.family === 4 ? parseIpv4(ip) : parseIpv6(ip.toLowerCase());
  if (addr === null) return false;
  const width = net.family === 4 ? 32 : 128;
  if (net.bits === 0) return true;
  const shift = BigInt(width - net.bits);
  return addr >> shift === net.addr >> shift;
}

export function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  return allowlist.some((entry) => ipMatchesEntry(ip, entry));
}

export function normalizeAllowlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && isValidAllowlistEntry(v));
}

async function fetchAllowlistFromDb(): Promise<string[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/platform_settings?select=settings&is_active=eq.true&tenant_id=is.null&order=updated_at.desc&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ settings?: { security?: { admin_ip_allowlist?: unknown } } }>;
    return normalizeAllowlist(rows?.[0]?.settings?.security?.admin_ip_allowlist);
  } catch (err) {
    console.error("[admin-ip-allowlist] failed to load allowlist; failing open", err);
    return null;
  }
}

export async function getAdminIpAllowlist(): Promise<string[]> {
  const envList = normalizeAllowlist((process.env.ADMIN_IP_ALLOWLIST ?? "").split(",").map((s) => s.trim()));
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return [...new Set([...envList, ...cache.list])];
  const fromDb = await fetchAllowlistFromDb();
  cache = { list: fromDb ?? [], fetchedAt: now };
  return [...new Set([...envList, ...cache.list])];
}

export function isAdminScopedPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

/**
 * Returns a 403 response when the caller IP is outside the allowlist; null when allowed
 * (or when no allowlist is configured).
 */
export async function enforceAdminIpAllowlist(request: NextRequest): Promise<NextResponse | null> {
  const allowlist = await getAdminIpAllowlist();
  if (allowlist.length === 0) return null;
  const ip = extractClientIp(request.headers);
  if (ipAllowed(ip, allowlist)) return null;

  console.warn("[admin-ip-allowlist] blocked", { ip, path: request.nextUrl.pathname });
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { data: null, error: { message: "Admin access is restricted to approved networks", code: "IP_NOT_ALLOWED" } },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } },
    );
  }
  return new NextResponse("Admin access is restricted to approved networks.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}
