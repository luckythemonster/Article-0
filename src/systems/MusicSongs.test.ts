import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MUSIC_TRACK_IDS,
  MUSIC_TRACKS,
  soundingBarCount,
  trackForLevel,
  type BeepBoxSongJson,
  type MusicTrackId,
} from "./MusicSongs";
import { VENT_CORE_LEVEL } from "../map/VentCoreLevel";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";

/**
 * The songs themselves, read off disk exactly as the browser will fetch them —
 * same approach as the map tests against the real `edplay.json`. They are hand
 * authored in BeepBox and re-exported over the top, so what this suite is
 * guarding is that a re-export still lands somewhere the game can play it.
 */
function song(id: MusicTrackId): BeepBoxSongJson & { channels: { sequence: number[] }[] } {
  const path = new URL(`../../public/${MUSIC_TRACKS[id].path}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as BeepBoxSongJson & {
    channels: { sequence: number[] }[];
  };
}

/** The song's own length, which BeepBox states only as the length of a sequence. */
function barCount(json: { channels: { sequence: number[] }[] }): number {
  return Math.max(...json.channels.map((c) => c.sequence.length));
}

describe("the score on disk", () => {
  it("has all four songs where the catalogue says they are", () => {
    expect(MUSIC_TRACK_IDS).toHaveLength(4);
    for (const id of MUSIC_TRACK_IDS) {
      const json = song(id);
      expect(json.format).toBe("BeepBox");
      expect(json.channels.length).toBeGreaterThan(0);
    }
  });

  it("is loaded from `public/`, so the paths are the URLs the game fetches", () => {
    for (const id of MUSIC_TRACK_IDS) {
      expect(MUSIC_TRACKS[id].path).toMatch(/^assets\/music\/[a-z0-9-]+\.json$/);
    }
  });

  it("has something to play in every song", () => {
    for (const id of MUSIC_TRACK_IDS) {
      const json = song(id);
      expect(soundingBarCount(json)).toBeGreaterThan(0);
      expect(soundingBarCount(json)).toBeLessThanOrEqual(barCount(json));
    }
  });

  it("would lose most of a song to the exported loop markers", () => {
    // The reason `MusicStream` overrides them rather than honouring them. The
    // main theme marks bars 8-13 of 38: played as exported, the other 24 never
    // sound. If a re-export ever *does* mark the whole song, this test is the
    // place to find that out.
    const theme = song("articleZeroTheme") as BeepBoxSongJson & {
      introBars: number;
      loopBars: number;
      channels: { sequence: number[] }[];
    };
    expect(theme.introBars + theme.loopBars).toBeLessThan(soundingBarCount(theme));
  });

  it("trims the empty bars three of the four carry off the end", () => {
    // Nine seconds of silence per pass, on the two tracks a boss fight loops.
    for (const id of ["roofFinale", "vent4Theme", "vent4Freakout"] as MusicTrackId[]) {
      const json = song(id);
      expect(soundingBarCount(json)).toBeLessThan(barCount(json));
    }
    // And leaves the one that plays to its last bar alone.
    const theme = song("articleZeroTheme");
    expect(soundingBarCount(theme)).toBe(barCount(theme));
  });
});

describe("soundingBarCount", () => {
  it("counts up to the last bar holding a pattern", () => {
    expect(soundingBarCount({ channels: [{ sequence: [1, 2, 3, 0, 0] }] })).toBe(3);
  });

  it("takes the longest-sounding channel, not the first", () => {
    // A drum channel that runs two bars past the melody still has to be played.
    expect(
      soundingBarCount({
        channels: [{ sequence: [1, 1, 0, 0] }, { sequence: [1, 1, 1, 1] }],
      }),
    ).toBe(4);
  });

  it("keeps an empty bar that has music after it", () => {
    // The rest is part of the song; only the tail is trimmed.
    expect(soundingBarCount({ channels: [{ sequence: [1, 0, 1] }] })).toBe(3);
  });

  it("returns 0 for a song with nothing in it", () => {
    // Which `MusicStream` reads as "leave the exported loop alone" rather than
    // handing the synth a zero-bar loop to divide by.
    expect(soundingBarCount({ channels: [{ sequence: [0, 0] }] })).toBe(0);
    expect(soundingBarCount({ channels: [] })).toBe(0);
    expect(soundingBarCount({})).toBe(0);
  });
});

describe("trackForLevel", () => {
  it("gives the two set-piece levels their own songs", () => {
    expect(trackForLevel(VENT_CORE_LEVEL)).toBe("vent4Theme");
    expect(trackForLevel(ROOF_ARRAY_LEVEL)).toBe("roofFinale");
  });

  it("plays the main theme everywhere else", () => {
    // Including the Act III vault, which has no song of its own and is meant to
    // sound like the rest of the facility rather than like a boss.
    for (const level of ["extraction", "alignment_vault", "log_cache_beta", ""]) {
      expect(trackForLevel(level)).toBe("articleZeroTheme");
    }
  });
});
