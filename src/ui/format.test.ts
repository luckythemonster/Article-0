import { describe, it, expect } from "vitest";
import { formatAgo, formatClock } from "./format";

describe("formatClock", () => {
  it("renders mm:ss, zero-padded", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5_000)).toBe("00:05");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("grows an hours field only once there are hours", () => {
    expect(formatClock(60 * 60_000)).toBe("1:00:00");
    expect(formatClock(3 * 60 * 60_000 + 7 * 60_000 + 9_000)).toBe("3:07:09");
  });

  it("floors rather than rounds, so the clock never reads ahead of itself", () => {
    expect(formatClock(1_999)).toBe("00:01");
  });

  it("degrades to zero on junk instead of printing NaN", () => {
    expect(formatClock(-5_000)).toBe("00:00");
    expect(formatClock(Number.NaN)).toBe("00:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("00:00");
  });
});

describe("formatAgo", () => {
  const now = 1_700_000_000_000;

  it("bands by the largest unit that fits", () => {
    expect(formatAgo(now - 5_000, now)).toBe("just now");
    expect(formatAgo(now - 59_000, now)).toBe("just now");
    expect(formatAgo(now - 60_000, now)).toBe("1m ago");
    expect(formatAgo(now - 59 * 60_000, now)).toBe("59m ago");
    expect(formatAgo(now - 60 * 60_000, now)).toBe("1h ago");
    expect(formatAgo(now - 23 * 60 * 60_000, now)).toBe("23h ago");
    expect(formatAgo(now - 24 * 60 * 60_000, now)).toBe("1d ago");
    expect(formatAgo(now - 10 * 24 * 60 * 60_000, now)).toBe("10d ago");
  });

  it("names a migrated v1 save rather than dating it to the epoch", () => {
    expect(formatAgo(0, now)).toBe("earlier build");
    expect(formatAgo(Number.NaN, now)).toBe("earlier build");
  });

  it("treats a clock that has gone backwards as just now", () => {
    // A save written on a machine whose clock was later corrected backwards.
    expect(formatAgo(now + 60_000, now)).toBe("just now");
  });
});
