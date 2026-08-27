/**
 * The score — which song plays where, and how much of each one loops.
 *
 * The four tracks are BeepBox exports, committed verbatim under
 * `public/assets/music/` and played at runtime by BeepBox's own synth (see
 * {@link ./MusicStream}). This module is the part of that with no audio in it:
 * the catalogue, the level→track mapping, and the loop maths — headless, so the
 * suite can check the real files without a browser.
 *
 * Editing a song means opening its JSON at beepbox.co, changing it there and
 * re-exporting over the file. Nothing in the repo generates them.
 */
import { VENT_CORE_LEVEL } from "../map/VentCoreLevel";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";

/** The four songs, keyed by the moment each was written for. */
export type MusicTrackId = "articleZeroTheme" | "vent4Theme" | "vent4Freakout" | "roofFinale";

export interface MusicTrack {
  /** The composer's own title — for the console and the debug overlay. */
  readonly title: string;
  /** Served out of `public/`, fetched the first time the track is asked for. */
  readonly path: string;
}

export const MUSIC_TRACKS: Record<MusicTrackId, MusicTrack> = {
  articleZeroTheme: { title: "Article Zero Theme", path: "assets/music/article-zero-theme.json" },
  vent4Theme: { title: "VENT-4", path: "assets/music/vent-4-theme.json" },
  vent4Freakout: { title: "VENT-4 (freakout)", path: "assets/music/vent-4-freakout.json" },
  roofFinale: { title: "Roof finale", path: "assets/music/roof-finale.json" },
};

/** Every track id, for the tests and the debug cycler. */
export const MUSIC_TRACK_IDS = Object.keys(MUSIC_TRACKS) as MusicTrackId[];

/**
 * The track a level plays under.
 *
 * Only the two set-piece levels have a song of their own; everything else — the
 * facility, the extraction floor, the vault — runs under the main theme, which
 * is also the title screen's. The Act III SMAC fight is deliberately not in
 * here: there is no fifth song, and it keeps the synthesised drones.
 *
 * The VENT-4 arena's track is only its *opening* one — `SetPieceEvents` swaps in
 * the freakout when the boss reaches its purge phase.
 */
export function trackForLevel(levelName: string): MusicTrackId {
  if (levelName === VENT_CORE_LEVEL) return "vent4Theme";
  if (levelName === ROOF_ARRAY_LEVEL) return "roofFinale";
  return "articleZeroTheme";
}

/**
 * As much of a BeepBox export as this module needs to read.
 *
 * A channel's `sequence` is one entry per bar naming the pattern that plays in
 * it, and `0` means "no pattern" — which is what {@link soundingBarCount} counts
 * from.
 */
export interface BeepBoxSongJson {
  format?: string;
  version?: number;
  channels?: readonly { readonly sequence?: readonly number[] }[];
}

/**
 * How many bars from the top of `song` actually sound — the loop length to hand
 * the synth.
 *
 * **Not `introBars`/`loopBars`.** Those markers are where the composer left the
 * editor's loop brackets, not where the song ends, and taking them literally
 * throws most of every track away: `article-zero-theme` marks bars 8–13 of 38,
 * so honouring it would loop six bars and never play the other twenty-four. All
 * four tracks are instead looped whole, from bar 0.
 *
 * The count stops at the last bar holding a pattern rather than at `barCount`,
 * because three of the four exports carry empty bars off the end — `roof-finale`
 * sounds through bar 24 of 28, both VENT-4 tracks through bar 23 — and looping
 * those would hang nine seconds of silence off the end of every pass.
 *
 * Returns 0 for a song with nothing in it, which the caller reads as "leave the
 * exported loop alone" rather than dividing by it.
 */
export function soundingBarCount(song: BeepBoxSongJson): number {
  let last = -1;
  for (const channel of song.channels ?? []) {
    const sequence = channel.sequence ?? [];
    for (let bar = sequence.length - 1; bar > last; bar--) {
      if (sequence[bar] !== 0) {
        last = bar;
        break;
      }
    }
  }
  return last + 1;
}
