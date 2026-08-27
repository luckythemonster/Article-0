/**
 * The recent past of in-world sound, so something other than a guard can read it.
 *
 * `NoiseEvents.emitAt` has always been fire-and-forget: it walks the guards in
 * earshot, calls `hearNoise` on each, and the event is gone by the end of the
 * frame. That is all a guard needs — it reacts immediately or not at all — but
 * it leaves no way to ask "what made a noise near me just now", which is what
 * the radar's compass ticks report.
 *
 * So this keeps a short tail of emissions. It is deliberately *not* the alert
 * network's {@link NoiseSpamTracker}: that one is anti-exploit bookkeeping in
 * tile space with no loudness and a ten-second window, purged on read. This one
 * is a readout's source — pixel space, carries the radius the sound was emitted
 * at, and expires on its own.
 *
 * **A ring, not a list.** Noises are rare (a handful a second at the very
 * worst) but `emitAt` sits on the hottest gameplay path there is, so recording
 * one must not allocate. A fixed `Float32Array` written round-robin never does,
 * and dropping the oldest entry when full is the right failure: if sixteen
 * distinct noises are live inside a second and a half, the ring is already
 * showing more than a reader can take in.
 */

/** How long (seconds) an emission stays readable after it happened. */
export const NOISE_FADE_SEC = 1.5;

/** Emissions held at once. Past this the oldest is overwritten. */
const CAPACITY = 16;

/** Fields per entry in {@link NoiseLog.data}: `x, y, radiusPx, time`. */
const STRIDE = 4;

/**
 * A rolling window of recent noise emissions, in world pixels.
 *
 * Hold one per run and hand it to both `NoiseEvents` (which writes) and
 * `buildRadarSnapshot` (which reads). Entries expire by age rather than being
 * consumed, so any number of readers can walk the same window in a frame.
 */
export class NoiseLog {
  /** Flat entries: `[x0, y0, r0, t0, x1, …]`. Slots past `count` are stale. */
  private readonly data = new Float32Array(CAPACITY * STRIDE);
  /** Where the next write lands. Wraps at {@link CAPACITY}. */
  private next = 0;
  /** Entries written so far, capped at {@link CAPACITY} — never decreases. */
  private count = 0;

  /**
   * Records one emission at `now` (seconds).
   *
   * `radiusPx` is how far the sound carries, not how loud it is at any given
   * point — the two are the same number in this game, because `emitAt` derives
   * a listener's intensity purely from how far into the radius they stand.
   */
  record(x: number, y: number, radiusPx: number, now: number): void {
    const i = this.next * STRIDE;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = radiusPx;
    this.data[i + 3] = now;
    this.next = (this.next + 1) % CAPACITY;
    if (this.count < CAPACITY) this.count++;
  }

  /**
   * Calls `fn` for every emission still inside {@link NOISE_FADE_SEC} of `now`.
   *
   * Order is unspecified — the ring is walked by slot, not by age. Every reader
   * so far combines entries with `max`, for which order does not matter; a
   * reader that needs newest-first should sort what it collects rather than
   * this imposing a cost on the ones that do not.
   */
  forEach(now: number, fn: (x: number, y: number, radiusPx: number) => void): void {
    for (let slot = 0; slot < this.count; slot++) {
      const i = slot * STRIDE;
      if (now - this.data[i + 3] > NOISE_FADE_SEC) continue;
      fn(this.data[i], this.data[i + 1], this.data[i + 2]);
    }
  }

  /** Drops every entry. Called on a level swap, where the old level's sounds are moot. */
  clear(): void {
    this.next = 0;
    this.count = 0;
  }
}
