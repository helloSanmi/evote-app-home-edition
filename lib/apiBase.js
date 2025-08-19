// frontend/lib/apiBase.js
export const api = (path) => {
  const base =
    typeof window !== "undefined" && window.__API_BASE__
      ? window.__API_BASE__
      : process.env.NEXT_PUBLIC_API_URL || "";

  // Normalize: avoid accidental double slashes
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
};

export async function safeJson(res) {
  if (!res) throw new Error("No response from server");
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const txt = await res.text();
    const msg =
      res.status === 401
        ? "Please sign in to continue."
        : `Server error (${res.status}).`;
    const e = new Error(msg);
    e._raw = txt;
    e._status = res.status;
    throw e;
  }
  return res.json();
}
