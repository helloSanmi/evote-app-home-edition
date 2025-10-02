export function mediaUrl(url) {
  if (!url) return "/placeholder.png";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}
