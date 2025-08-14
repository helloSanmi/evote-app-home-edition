// frontend/lib/apiBase.js
// Single source of truth for API base — always builds same-origin /api by default
const raw = process.env.NEXT_PUBLIC_API_URL;
export const API_BASE =
  typeof raw === "string" && raw.trim() && raw.trim() !== "undefined" ? raw.trim() : "";
export const api = (p = "") => `${API_BASE}/api${p.startsWith("/") ? p : `/${p}`}`;