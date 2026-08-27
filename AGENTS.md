# Article Zero — orientation

An SNES-style top-down stealth RPG engine in TypeScript / Phaser 3 / Vite. It parses a
tile-editor map export (`public/assets/edplay.json`) into a normalized model, generates
two more levels in code at boot, and runs a four-act stealth game on top.

## Commands

**npm is the package manager** — `package-lock.json` is the only lockfile, and CI
runs `npm ci` against it. Don't add a second one.

```bash
npm install
npm run dev             # vite dev server
npm run build           # tsc --noEmit + vite build — the gate CI runs
npm test                # vitest, covers the pure systems
npm run docs:types      # regenerate docs/TYPE_REFERENCE.md
```

Before you push, run the gate yourself:

```bash
npx tsc --noEmit && npx vitest run
```

The suite is fast (~12s) and currently **1053 tests across 82 files, all passing**.
A drop in that count means you broke something rather than that the suite shrank.

CI (`.github/workflows/ci.yml`) runs `npm run build`, `npm test`, and a check that
`docs/TYPE_REFERENCE.md` is up to date on every push.

## Where to look

| Doing this | Read |
| --- | --- |
| Anything — start here | [`README.md`](README.md) — controls, mechanics, architecture, directory map |
| Authoring or debugging a map | [`docs/MAP_AUTHORING.md`](docs/MAP_AUTHORING.md) |
| Changing behaviour that looks deliberate | [`docs/DESIGN_NOTES.md`](docs/DESIGN_NOTES.md) — the reasoning, so you know what you'd be undoing |
| Tuning gameplay numbers | [`docs/ENTITY_STATS_DEFAULTS.md`](docs/ENTITY_STATS_DEFAULTS.md) + `src/systems/EntityStats.ts` |
| Fonts, sprites, VFX | [`docs/ART_PIPELINE.md`](docs/ART_PIPELINE.md) |
| Finding a type | [`docs/TYPE_REFERENCE.md`](docs/TYPE_REFERENCE.md) — generated, ~5.6k lines. Grep it, don't read it |

`.jules/` holds dated per-agent lesson logs (performance, security, accessibility). Add
to the matching file when you learn something that would have saved you an hour.

## Decoding the names

The fiction supplies the vocabulary, so a lot of filenames name a thing in the
*Architecture of Suffering* setting rather than an engineering role. Every one of
these files opens with a header comment that explains itself — but you have to
open it first to find that out, so:

| File | What it actually is |
| --- | --- |
| `systems/Vent4Core.ts` | Act II boss: state machine + "Compliance Index" economy |
| `systems/SmacCore.ts` | Act III boss (NW-SMAC-01, the Alignment Core): state machine |
| `systems/RelayCore.ts` | Act IV rooftop relay: state machine |
| `systems/Conduct.ts` | Whether Rowan currently reads to the facility as staff |
| `systems/Compliance.ts` | The Doctrinal Compliance minigame (a log-pruning word puzzle) |
| `systems/QualiaLock.ts` | The Qualia Phase-Lock minigame (a waveform-matching puzzle) |
| `systems/SharedField.ts` | The WX-9 merge — the undetectable window (**F**) |
| `systems/Surrender.ts` | The hold-up: aiming at an orderly rather than firing (**Q**) |
| `systems/Lexicon.ts` | In-game glossary shown in the pause menu's index |
| `systems/Journal.ts` | In-game journal entries |
| `systems/Explored.ts` | Fog of war for the pause menu's map |

**The `*Core` suffix is a convention, not decoration.** All three bosses use the
same split: a pure, Phaser-free state machine in `src/systems/<X>Core.ts` that
unit-tests directly, and a Phaser shell in `src/entities/` that draws it. If you
are changing boss *rules*, you want the `Core`; if you are changing how it
*looks*, you want the entity.

## Finding things in `GameScene`

`GameScene.ts` drives one frame of the game and delegates most of what happens in
it to `src/scenes/game/`. Start there rather than grepping the scene:

| Looking for | File |
| --- | --- |
| Turning a parsed level into live objects | `LevelBuilder.ts` |
| What guards and cameras can sense this frame | `SensingContext.ts` |
| Doors, chests, knocks, the alert-network rally | `NoiseEvents.ts` |
| The VENT-4 / vault / roof encounters | `Encounters.ts` (rules) + `SetPieceEvents.ts` (cues) |
| Pause, codec and the two minigame overlays | `OverlayGate.ts` |
| The `[E]` verb and the status marker | `InteractPrompt.ts` |
| Vaulting furniture, holding a wall | `VaultAndPress.ts` |
| Ladders and ramps between a level's surfaces | `PlaneTraversal.ts` |
| The seen-tile mask and its sweep | `ExploredTracker.ts` |
| What a guard could notice as out of place | `Anomalies.ts` |
| Breakers, blackouts, and the orderly sent to fix them | `PowerControl.ts` |
| Completed hacks, and which terminals are special | `TerminalHacks.ts` |
| What each item does when used | `ItemActions.ts` |
| Debug hotkeys and overlays | `DebugOverlay.ts` |

What deliberately stays in the scene is the frame's **ordering** — `updateWorld`
— and the E-press claim chain in `updateInteractions`, where the sequence is the
design: each step `&&`-guards on the ones above it, so a verb can never be
consumed twice. Splitting that chain would undo the thing it exists to do.

## Invariants

These are the ones that bite. Each has burned someone already.

- **The four songs in `public/assets/music/` are BeepBox exports, committed verbatim** —
  the same posture as the map. Edit one at [beepbox.co](https://www.beepbox.co) and
  re-export over the file; do not hand-edit the JSON, and do not re-indent it. They are
  played at runtime by `beepbox`'s own synthesiser (`src/systems/MusicStream.ts`), so a
  song that will not load is a silent fallback to the synthesised drones plus one console
  warning — not a crash.
- **Never hand-edit `public/assets/edplay.json`.** It is the tile editor's export,
  committed verbatim and served as-is. Everything the engine adds is built at boot by
  cloning tiles the map already places (`src/map/generate.ts`).
- **`src/systems/EntityStats.ts` owns the gameplay numbers**, not the map. The map leaves
  tuning at 0/null, and `num()` treats a `0` as *unset* — so you cannot author a genuine
  zero, and a "0" in the map means "use the default".
- **The cast has no art on disk.** Rowan, the orderlies, the enforcers and the drones are
  drawn at boot by `src/entities/CastArt.ts`, into textures keyed exactly as the old sprite
  sheets were — which is why the entity classes never mention it. Each figure is drawn to
  fill its `src/entities/Silhouette.ts` box, and that box is what the physics body, the
  guard radii and the ground shadows are all taken from: change the drawing and the box
  together, or they part company.
- **Re-run `npm run docs:types` after adding or renaming a declaration**, and commit the
  result. Never hand-edit `docs/TYPE_REFERENCE.md`.
- **Every `.aseprite` in `public/assets/` is source; the PNGs beside it are generated.**
  `tools/panel/build_panel.py` and `tools/sprites/build_sprites.py` cut them, and both
  emit a JSON frame map (`src/ui/networkIndicatorFrames.json`,
  `src/entities/entitySpriteFrames.json`) that code addresses frames through. Editing a
  generated PNG is lost on the next run; addressing a frame by index instead of by the
  artist's tag or cel label is what the indirection exists to prevent.
- **Sprite sizes are load-bearing.** `(tileSize * displayTiles) / sourceSize * cameraZoom`
  must come out a whole number or `pixelArt: true` starts resampling. Enforced by
  `src/render/pixelScale.ts` and its test.
- **`motion` is an unimported but required peer dependency** of `@arwes/frames`. Removing
  it from `package.json` breaks the install.
- **`@arwes/frames` is pinned to a prerelease (`1.0.0-next.*`) and ships an `eval`.**
  The build warns about it every time; the warning is expected, not a regression you
  introduced. Accepted deliberately: the game is client-side and single-player, with
  no server, no auth and no user-supplied data reaching that code path, so the `eval`
  is not reachable by an attacker. It is used by `src/ui/frame.ts`,
  `src/ui/PauseMenuView.ts` and `src/scenes/CodecScene.ts`. Revisit if the project ever
  renders untrusted content.
- **Never put a raw control character in a source file.** A literal NUL as a key
  separator once made `git` diff two files as binary and made `grep` skip them
  *silently* — searches came back clean because the files were never read. Write the
  escape (`\u0000`) instead; the runtime value is identical.
- **Systems under `src/systems/` are headless** — no Phaser, no DOM. That is what lets the
  unit tests drive them directly; keep it that way.
