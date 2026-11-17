import axios from "axios";

// Single place that knows where the backend lives.
export const API_ORIGIN = "http://localhost:5000";

const api = axios.create({ baseURL: `${API_ORIGIN}/api` });

/**
 * Turn a stored, relative file path into a full URL the browser can open.
 * e.g. "uploads/letters/123-abc.pdf" -> "http://localhost:5000/uploads/letters/123-abc.pdf"
 * Already-absolute URLs are returned unchanged.
 */
export const fileUrl = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_ORIGIN}/${s.replace(/\\/g, "/").replace(/^\/+/, "")}`;
};

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export default api;
