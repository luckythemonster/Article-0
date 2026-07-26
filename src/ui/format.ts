/**
 * Small display formatters for the pause menu.
 *
 * Split out of `PauseMenuView` so they can be unit-tested: that module pulls in a
 * stylesheet and the Arwes frame builder, neither of which belongs in a node test
 * run, and both of these have edge cases worth pinning down.
 */

/** `mm:ss`, or `h:mm:ss` once a run has run long. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Coarse "how long ago", for the save-slot listing.
 *
 * A checkpoint migrated up from a v1 save carries `savedAt: 0` — it genuinely
 * predates the field — which would otherwise render as several decades ago. It
 * gets named for what it is instead.
 */
export function formatAgo(epochMs: number, now = Date.now()): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "earlier build";
  const seconds = Math.max(0, (now - epochMs) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
