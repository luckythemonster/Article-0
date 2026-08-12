# Article Zero — orientation

An SNES-style top-down stealth RPG engine in TypeScript / Phaser 3 / Vite. It parses a
tile-editor map export (`public/assets/edplay.json`) into a normalized model, generates
two more levels in code at boot, and runs a four-act stealth game on top.

## Commands

```bash
npm install
npm run dev             # vite dev server
npm run build           # tsc --noEmit + vite build — the gate CI runs
npm test                # vitest, covers the pure systems
npm run docs:types      # regenerate docs/TYPE_REFERENCE.md
```

CI (`.github/workflows/ci.yml`) runs `npm run build` and `npm test` on every push.

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

## Invariants

These are the ones that bite. Each has burned someone already.

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
- **Sprite sizes are load-bearing.** `(tileSize * displayTiles) / sourceSize * cameraZoom`
  must come out a whole number or `pixelArt: true` starts resampling. Enforced by
  `src/render/pixelScale.ts` and its test.
- **`motion` is an unimported but required peer dependency** of `@arwes/frames`. Removing
  it from `package.json` breaks the install.
- **Systems under `src/systems/` are headless** — no Phaser, no DOM. That is what lets the
  unit tests drive them directly; keep it that way.
