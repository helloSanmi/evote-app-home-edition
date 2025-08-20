// frontend/lib/apiBase.js
export function api(path = "") {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? window.__API_BASE__ : "") ||
    "";
  return `${base}${path}`;
}

export async function safeJson(res) {
  try {
    const ct = res?.headers?.get?.("content-type") || "";
    if (!ct.includes("application/json")) {
      await res.text(); // drain
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}
