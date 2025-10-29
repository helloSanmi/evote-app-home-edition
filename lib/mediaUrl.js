import { absUrl } from "./apiBase.js";

const trimTrailingSlash = (value) => String(value || "").replace(/\/$/, "");

export function mediaUrl(url) {
  if (!url) return "/placeholder.png";
  const raw = String(url).trim();
  if (!raw) return "/placeholder.png";
  const lower = raw.toLowerCase();

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    if (lower.startsWith("http://")) {
      try {
        const target = API_BASE ? new URL(API_BASE) : null;
        const current = new URL(raw);
        if (target && target.protocol === "https:" && current.hostname === target.hostname) {
          return `https://${current.host}${current.pathname}${current.search}${current.hash}`;
        }
      } catch {
        // fall through to return raw
      }
    }
    return raw;
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("/uploads")) {
    const envBase = trimTrailingSlash(String(process.env.NEXT_PUBLIC_API_URL || ""));
    const base = envBase || trimTrailingSlash(absUrl("") || "");
    if (!base) return normalized;
    return `${base}${normalized}`;
  }

  return normalized;
}
