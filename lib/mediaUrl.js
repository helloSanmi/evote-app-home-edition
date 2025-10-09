export function mediaUrl(url) {
  if (!url) return "/avatar.png";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const normalized = url.startsWith("/") ? url : `/${url}`;
  if (normalized.startsWith("/uploads")) {
    return base ? `${base}${normalized}` : normalized;
  }
  return normalized;
}
