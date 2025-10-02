// frontend/lib/apiBase.js
const rawBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function inferDefaultBase() {
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin.replace(":3000", ":5050");
  }
  return "http://localhost:5050";
}

export const API_BASE = rawBase || inferDefaultBase();
export const api = API_BASE; // legacy export used across the app

export function absUrl(path = "") {
  if (!path) return API_BASE;
  if (/^https?:/i.test(path)) return path;
  if (!API_BASE) return path;
  return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
}

export async function safeJson(res) {
  try {
    const ct = res.headers?.get?.("content-type") || "";
    if (!ct.includes("application/json")) {
      await res.text?.();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function authHeaders(extra = {}, expectJsonBody = false) {
  const h = { ...extra };
  if (expectJsonBody && !h["Content-Type"]) h["Content-Type"] = "application/json";
  const t = (typeof window !== "undefined" && localStorage.getItem("token")) || "";
  if (t && !h.Authorization) h.Authorization = `Bearer ${t}`;
  return h;
}

async function request(method, path, body, options = {}) {
  const url = /^https?:/i.test(path) ? path : absUrl(path);
  const isJsonBody = body !== undefined && !(body instanceof FormData);
  const headers = authHeaders(options.headers || {}, isJsonBody);
  const fetchOptions = {
    method,
    headers,
    credentials: options.credentials ?? "include",
  };
  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = isJsonBody ? JSON.stringify(body ?? {}) : body;
  }
  const res = await fetch(url, fetchOptions);
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.message || `${method} ${path} failed`);
  return data;
}

export const apiGet = (path, options) => request("GET", path, undefined, options);
export const apiPost = (path, body, options) => request("POST", path, body, options);
export const apiPut = (path, body, options) => request("PUT", path, body, options);
export const apiDelete = (path, options) => request("DELETE", path, undefined, options);

// Shorthand aliases kept for backwards compatibility with existing pages
export const jget = apiGet;
export const jpost = apiPost;
export const jput = apiPut;
export const jdel = apiDelete;
