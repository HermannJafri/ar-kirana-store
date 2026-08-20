import { auth } from "./firebase";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Attaches the current Firebase ID token to every backend request.
// Every read and write goes through the Express backend — see
// PROJECT_PROMPT.md ("Why every data access goes through the backend").
export async function authFetch(path: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}
