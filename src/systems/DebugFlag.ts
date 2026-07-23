const STORAGE_KEY = "article0.debug";

/**
 * Whether the debug mode (backtick to open, god/no-clip/warp/overlay) should be
 * wired up at all. True in `npm run dev`. In any built deployment — including a
 * Vercel preview, where there's no way to run a local dev server — it's an
 * explicit opt-in: visit the page once with `?debug` (or `?debug=1`) in the URL.
 * That's remembered in localStorage so it stays on for the rest of the session
 * (level warps, page refreshes) without needing the query string every time.
 * `?debug=0` clears the opt-in.
 */
function computeDebugAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  if (params.has("debug")) {
    const on = params.get("debug") !== "0";
    try {
      if (on) window.localStorage.setItem(STORAGE_KEY, "1");
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private browsing, etc.) — the opt-in just
      // won't persist past this page load, which is an acceptable fallback.
    }
    return on;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Computed once at module load — the URL only needs checking on initial load. */
export const DEBUG_ALLOWED = computeDebugAllowed();
