import { describe, it, expect } from "vitest";
import { clipFrames, entityAnimKey, framesLabelled } from "./EntitySprites";

/**
 * The art->code contract, checked against the generated manifest.
 *
 * `tools/sprites/build_sprites.py` reads the artist's tags and cel labels out
 * of the `.aseprite` sources and writes `entitySpriteFrames.json`; the entity
 * classes ask for clips by name. Nothing in between is typed, so a redraw that
 * renamed or dropped a tag would surface as a camera that quietly stopped
 * animating rather than as a failure.
 *
 * These assert the *names*, never the frame numbers — that indirection is the
 * whole point, and a test that pinned indices would have to be rewritten every
 * time a frame was inserted, which is exactly what the design avoids.
 */
describe("clipFrames", () => {
  it("finds a clip that appears once by name alone", () => {
    // Terminal is the simple case for tags: three, no repeats. It also carries
    // cel labels (screen, status_light) that clipFrames doesn't need here —
    // the tag alone resolves each of these three.
    expect(clipFrames("terminal", "IDLE").length).toBeGreaterThan(0);
    expect(clipFrames("terminal", "IN_USE").length).toBeGreaterThan(0);
    expect(clipFrames("terminal", "DESTROYED").length).toBeGreaterThan(0);
  });

  it("tells the camera's four identically-named clips apart by facing", () => {
    // `security_camera.aseprite` names all four facings' clips `active`, so the
    // tag alone is ambiguous and the cel label is what resolves it. Getting
    // this wrong points every camera in the level the same way.
    const facings = ["north", "east", "south", "west"];
    const runs = facings.map((f) => clipFrames("security-camera", "active", f));

    for (const [i, run] of runs.entries()) {
      expect(run.length, facings[i]).toBe(2); // the two-frame LED blink
    }
    // Four facings, four disjoint frame pairs, covering all eight frames.
    const all = runs.flat();
    expect(new Set(all).size).toBe(8);
  });

  it("gives a disabled camera the single dark-lamp frame of its own facing", () => {
    for (const facing of ["north", "east", "south", "west"]) {
      const off = clipFrames("security-camera", "disabled", facing);
      const on = clipFrames("security-camera", "active", facing);
      expect(off.length, facing).toBe(1);
      // The dark frame is the second of that facing's pair, not some other
      // facing's — which is the thing the label lookup is actually for.
      expect(on, facing).toContain(off[0]);
    }
  });

  it("returns nothing for a clip the art does not have", () => {
    // Degrades to "no animation" rather than throwing mid-scene: an entity
    // asking for a clip a redraw removed falls back to its drawn rendering.
    expect(clipFrames("terminal", "no-such-tag")).toEqual([]);
    expect(clipFrames("security-camera", "active", "up")).toEqual([]);
  });
});

describe("framesLabelled", () => {
  it("searches every layer by default", () => {
    // The camera's two layers are both called `Layer N` and both carry the
    // facing labels, so nothing should have to name either of them.
    expect(framesLabelled("security-camera", "south").size).toBeGreaterThan(0);
  });

  it("narrows to one layer when a word means two things", () => {
    // The substation says `ERROR` on its status ring *and* on its screen, and
    // they are not the same frames. Merging them is the bug this guards.
    const ring = framesLabelled("terminal-substation", "ERROR", "status_indicator_ring");
    const screen = framesLabelled("terminal-substation", "ERROR", "screen");
    const both = framesLabelled("terminal-substation", "ERROR");

    expect(ring.size).toBeGreaterThan(0);
    expect(screen.size).toBeGreaterThan(0);
    expect(ring).not.toEqual(screen);
    for (const f of [...ring, ...screen]) expect(both).toContain(f);
  });

  it("is empty for a label nothing carries", () => {
    expect(framesLabelled("terminal-substation", "NOPE").size).toBe(0);
  });
});

/**
 * The breaker's keypad, which is the most demanding thing the manifest carries.
 *
 * `Breaker.throwFrames` composes a throw out of single frames looked up three
 * different ways — a tag disambiguated by a cel label, a digit on one layer
 * intersected with a screen state on another, and an open-cabinet frame found by
 * *subtracting* the digit frames. All three have to keep working across a
 * redraw, and none of them is expressible as "frame N".
 */
describe("the breaker keypad", () => {
  const SCREENS = ["POWER_ON", "POWER_OFF"];

  it("has every digit 0-9 exactly once per screen colour", () => {
    // The source draws the full digit set twice, once green and once red, which
    // is what lets a code be punched in while cutting *and* while restoring.
    for (const screen of SCREENS) {
      const onScreen = framesLabelled("breaker", screen, "SCREEN");
      for (let digit = 0; digit <= 9; digit++) {
        const frames = [...framesLabelled("breaker", String(digit), "CONTROLS")].filter((f) =>
          onScreen.has(f),
        );
        expect(frames.length, `${digit} on ${screen}`).toBe(1);
      }
    }
  });

  it("keeps the two screen colours' digit runs disjoint", () => {
    const green = framesLabelled("breaker", "POWER_ON", "SCREEN");
    const red = framesLabelled("breaker", "POWER_OFF", "SCREEN");
    expect(green.size).toBeGreaterThan(0);
    expect(red.size).toBeGreaterThan(0);
    for (const f of green) expect(red.has(f)).toBe(false);
  });

  it("tells the two IDLE tags apart by which screen they sit on", () => {
    // Both mean "cabinet shut" and they are the same word; only the screen
    // colour says whether the circuit behind it is live. Collapsing them would
    // leave the breaker resting on the wrong face after a throw.
    const powered = clipFrames("breaker", "IDLE", "POWER_ON");
    const unpowered = clipFrames("breaker", "IDLE", "POWER_OFF");
    expect(powered.length).toBe(1);
    expect(unpowered.length).toBe(1);
    expect(powered[0]).not.toBe(unpowered[0]);
  });

  it("has one open-cabinet frame per screen colour with no digit showing", () => {
    // How `blankKeypadFrame` finds the door-opening beat. The artist labelled
    // only one of the two (`idle` on the red one), so the pair is found by
    // subtracting the digits rather than by a name they do not share.
    const open = framesLabelled("breaker", "OPEN", "DOOR");
    const isDigit = (f: number): boolean =>
      [...Array(10).keys()].some((d) =>
        framesLabelled("breaker", String(d), "CONTROLS").has(f),
      );

    for (const screen of SCREENS) {
      const onScreen = framesLabelled("breaker", screen, "SCREEN");
      const blank = [...open].filter((f) => onScreen.has(f) && !isDigit(f));
      expect(blank.length, screen).toBe(1);
    }
  });
});

/**
 * The four doors, the second-most demanding thing the manifest carries after
 * the breaker.
 *
 * Every tag here is read by `Door.ts`, and two of them mean something other
 * than their name suggests — which is exactly why these assert against the
 * `door` layer's own cel labels rather than trusting the tag.
 */
describe("the door sprites", () => {
  const DOOR_IDS = [
    "door-single-east-west",
    "door-single-north-south",
    "door-glass-east-west",
    "door-glass-north-south",
  ] as const;

  /** The layer carrying the door panel itself, which the glass pair renames. */
  const doorLayer = (id: (typeof DOOR_IDS)[number]): string =>
    id.includes("glass") && id.includes("north-south") ? "GLASS_DOOR" : "door";

  it("names the same tags on all four, in the same casing", () => {
    // The north-south pair used to spell this one `idle` while the east-west
    // pair said `IDLE`, and `Door.ts` carried a branch to paper over it. The
    // redraw made them agree; this is what keeps them that way.
    for (const id of DOOR_IDS) {
      for (const tag of ["IDLE", "SCAN", "LOCKED", "UNLOCKED", "OPENING", "MOTION_DETECTION"]) {
        expect(clipFrames(id, tag).length, `${id} ${tag}`).toBeGreaterThan(0);
      }
      expect(clipFrames(id, "idle"), id).toEqual([]);
    }
  });

  it("holds the door shut for every closed-state tag", () => {
    // IDLE/SCAN/LOCKED/UNLOCKED differ only in the indicator light; the panel
    // itself must not move, or `Door.ts` would be showing a door ajar while
    // the collision grid still says solid.
    for (const id of DOOR_IDS) {
      const shut = framesLabelled(id, "CLOSED", doorLayer(id));
      const shutLower = framesLabelled(id, "closed", doorLayer(id));
      const closed = new Set([...shut, ...shutLower]);
      for (const tag of ["IDLE", "SCAN", "LOCKED", "UNLOCKED"]) {
        for (const f of clipFrames(id, tag)) {
          expect(closed.has(f), `${id} ${tag} frame ${f}`).toBe(true);
        }
      }
    }
  });

  it("is MOTION_DETECTION, not any tag called OPEN, that holds the door open", () => {
    // The single most misreadable thing in this art. The old sources had an
    // `OPEN` tag; these do not, and the frames the door layer labels `OPEN`
    // are precisely `MOTION_DETECTION`'s — the door standing open with its
    // sensor counting what goes through. Reading the name instead of the
    // pixels would leave a door that opens and then snaps shut on screen.
    for (const id of DOOR_IDS) {
      expect(clipFrames(id, "OPEN"), id).toEqual([]);
      const motion = clipFrames(id, "MOTION_DETECTION");
      const openFrames = framesLabelled(id, "OPEN", doorLayer(id));
      expect(motion.length, id).toBeGreaterThan(0);
      expect(new Set(motion), id).toEqual(openFrames);
    }
  });

  it("runs UNLOCKED straight into OPENING with no gap", () => {
    // Why `Door.ts` plays them as one clip: the granted beat is the authored
    // lead-in to the slide, not a separate state to sit in.
    for (const id of DOOR_IDS) {
      const unlocked = clipFrames(id, "UNLOCKED");
      const opening = clipFrames(id, "OPENING");
      expect(unlocked[unlocked.length - 1] + 1, id).toBe(opening[0]);
    }
  });

  it("tags CLOSING over the same frames as OPENING, not reversed", () => {
    // The reason `Door.ts` never reads the `CLOSING` tag: every source names
    // it, but over the *identical* range as `OPENING` — the artist marked
    // "this is also the travel" rather than drawing a second, reversed clip.
    // Playing that tag for a close would slide the door open again.
    for (const id of DOOR_IDS) {
      const opening = clipFrames(id, "OPENING");
      const closing = clipFrames(id, "CLOSING");
      expect(opening.length, id).toBeGreaterThan(1);
      expect(new Set(closing), id).toEqual(new Set(opening));
    }
  });
});

describe("entityAnimKey", () => {
  it("keeps a facing-qualified clip distinct from a bare one", () => {
    // Both exist for the camera. One key for both would mean the first facing
    // registered wins and every other camera plays it.
    expect(entityAnimKey("security-camera", "active")).not.toBe(
      entityAnimKey("security-camera", "active", "south"),
    );
    expect(entityAnimKey("security-camera", "active", "south")).not.toBe(
      entityAnimKey("security-camera", "active", "north"),
    );
  });
});
