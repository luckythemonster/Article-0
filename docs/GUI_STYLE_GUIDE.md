# GUI style guide

How to draw interface art for *Article Zero* so it lands in the game looking like
it belongs there.

The game's world art is pixel art on a 32px tile grid, drawn through a 2x camera.
The interface is not: it runs in its own unzoomed scene, and almost all of it is
currently drawn with rectangles and strokes rather than art. This document is for
replacing that with hand-drawn chrome, and for the one existing set of UI art —
the item icons — which does not currently follow any of it.

---

## 1. The one rule

**Author UI art at the size it appears on screen.**

`UIScene` is deliberately unzoomed and screen-anchored (`src/scenes/UIScene.ts`).
The world camera's 2x zoom does not touch it. So a UI texture reaches the screen at
whatever scale it is drawn at, and the rule from `src/render/pixelScale.ts` — which
governs character sprites — collapses to something simpler and stricter:

> screen pixels per art pixel must be a whole number, and at least 1.

A 32px icon shown in a 32px box is 1. A 16px icon shown at 32px is 2 — also fine, a
clean doubling. Anything else resamples:

| ratio | what happens |
|---|---|
| **1, 2, 3** | each art pixel maps to a fixed block. The art is reproduced. |
| **1.09** | most pixels get one screen pixel, every eleventh gets two — and *which* ones depends on where the element sits, so outlines break up and line weights flicker. |
| **0.125** | pixels are thrown away outright. Cannot be fixed by drawing better. |

That last row is not hypothetical: nine of the ten item icons are 256x256 line art
displayed in a 32px box. `image-rendering: pixelated` does not rescue them — it only
makes the discarding sharp-edged instead of blurry.

`src/render/uiScale.ts` states the rule in code and `uiScale.test.ts` enforces it
against every entry in the texture manifest. Art added at the wrong resolution
fails the build rather than shipping soft.

## 2. Sizes the art must survive

There is no fixed internal resolution. The canvas is `92vw x 92vh` floored to whole
pixels and capped at **1280x800**; the smallest size budgeted for is **640x480**
(`MIN_CANVAS_W/H` in `src/ui/hudLayout.ts`).

So: **no full-screen background art, and no panel drawn at one fixed width.**
Anything that spans a region has to nine-slice. Anything anchored to a corner (the
radar, an icon) can be a fixed-size sprite, because corners do not stretch.

## 3. Palette

`src/ui/theme.css` is the single source of truth, mirrored for canvas code in
`src/ui/hudTheme.ts` and checked by `hudTheme.test.ts`. **Use these values and no
others.** A GUI sprite introducing its own blue is the thing this guide most wants
to prevent — the HUD spent a while with four slightly different greys before the
tokens existed.

**Accents** — these carry meaning, don't use them decoratively:

| token | hex | means |
|---|---|---|
| `--c-cyan` | `#39d3ff` | the interface itself; nominal state |
| `--c-cyan-bright` | `#5fe0ff` | emphasis on cyan |
| `--c-amber` | `#ffb03b` | caution — evasion, flagged conduct |
| `--c-amber-bright` | `#ffe14d` | guard blips |
| `--c-red` | `#ff5c6a` | jammed, degraded |
| `--c-red-deep` | `#ff3b3b` | alert |
| `--c-green` | `#5effa0` | healthy |
| `--c-green-soft` | `#8effc0` | the Shared Field's "we" |
| `--c-blue-soft` | `#9fd2ff` | compliant, passing as staff |

**Surfaces and structure:**

| token | hex | use |
|---|---|---|
| `--c-bg-panel` | `#070c12` | panel interiors |
| `--c-bg-scope` | `#03070c` | the radar's well |
| `--c-track` | `#11202b` | empty bar tracks |
| `--c-border` | `#2b6e7a` | lit border |
| `--c-border-cool` | `#2b4356` | the default border |
| `--c-border-dim` | `#2b3a44` | recessed border |

**Text ramp**, brightest to faintest: `#bfe3ea` `#cfe0f0` `#9fb6c2` `#8fa9b4`
`#8899aa` `#6b7f92` `#4a5a68` `#45566a`.

The canvas clears to `#05070a`, darker than any panel — panels should read as
lighter than the void behind them, never darker.

## 4. Panel chrome

Panels are the one thing that cannot be a fixed sprite: they wrap content of
different widths, and some change width at runtime. They ship as **nine-slice** —
corners fixed, edges stretched along one axis, middle stretched both ways.

- **Source size: 48x48. Slice inset: 12px.** That gives four 12x12 corners, four
  12x24 edges, and a 24x24 middle. Registered as `ui-panel` in
  `src/ui/UiTextures.ts`.
- **Only the corners are safe for detail.** Anything drawn in an edge region gets
  stretched along that edge — a bolt head in the top edge becomes a smear. Put
  detail in corners; keep edges to lines that survive stretching.
- **1px stroke weight.** At 1:1 there is no zoom to hide a 2px line, and the HUD's
  existing chrome is all 1px. Use `--c-border-cool` for the default border.
- **The middle should be near-flat.** `--c-bg-panel` at ~85% alpha is what the
  drawn fallback uses; a gradient in the middle region stretches unevenly.

Panels degrade to a stroked rectangle when the art is absent (`uiPanel()` in
`src/ui/NineSlicePanel.ts`), so the sprite should read as an *upgrade* of that
rectangle, not a different visual language.

## 5. Item and status icons

**32x32, native pixel art, in the palette above.**

The reference is `public/assets/icons/sack_lunch.png` — the one icon authored at
size, and the one that sits correctly next to the world sprites. The other nine are
the anti-reference: 256x256 smooth monochrome line art, effectively clip art from
another program, squeezed 8:1.

- **Silhouette first.** At 32x32 an icon is read by outline before anything else.
  If it isn't identifiable as a black shape, detail won't save it.
- **1px outline**, darker than the fill — `--c-bg-panel` or `--c-border-dim`.
- **Three to four values per material.** A base, a shadow, a highlight, and
  optionally one accent. More than that turns to mush at this size.
- **Reserve the accent colours for meaning.** A medkit may be red because it is a
  medkit; don't use `--c-red-deep` as a decorative trim, since the HUD uses it for
  alert.
- **Keep a 1px margin** inside the 32x32 box so the icon doesn't touch its
  neighbours in the inventory strip.

Drop new icons in `public/assets/ui/icons/` under the **same filename** as the
legacy 256px version (`medkit.png`, `battery.png`, …). The pause menu tries the
native path first and silently falls back to the old one, so the set can be
replaced one file at a time with the game playable throughout.

**The current set**, all needing redrawing: `EMP_grenade`, `Q0_certification`,
`access_chit`, `battery`, `disk`, `flashlight-off`, `flashlight-on`, `medkit`,
`thermal_gel`. `sack_lunch` is already correct.

**Items with no icon at all** — the backlog: Stun Rounds, the Pneumatic
Rail-Stapler, and the two LOG_CACHE fragments.

## 6. Radar bezel

The radar is a circular scope anchored top-right, radius **46px**.

- **Source size: 96x96**, registered as `ui-radar-bezel`.
- **The interior must be transparent.** The scope's contents — terrain, blips, the
  player marker — are drawn into a separate masked layer *underneath* the bezel.
  Anything opaque inside the ring hides them rather than sitting behind them.
- The ring currently draws as a 2px `--c-border-cool` circle. A sprite can add
  bezel depth, tick marks, a bearing scale — as long as it stays within 96x96 and
  leaves the middle clear.

## 7. What not to draw

These are generated at runtime and would be wasted effort:

- **Light cones and the flashlight falloff** — `src/ui/Lighting.ts`, procedural.
- **Radial light stamps** — `src/render/stamps.ts`, generated at 256px.
- **Radar blips, the sweep, terrain dots and the jam static** — all drawn per frame
  from live game state, and the static is deliberately re-randomised every frame.
- **Bars, meters and gauges** — the SRP meter, bio-integrity and the Shared Field
  gauge stay as primitives for now.

## 8. Text is not your problem, but glyphs are

All HUD text is **Share Tech Mono** at 10/11/12/13/20px (`UI_TEXT` in
`src/ui/hudTheme.ts`). Don't draw lettering into GUI sprites — it won't match the
font's hinting at these sizes, and it can't be localised or restyled.

If a sprite needs a symbol, the interface already has fourteen:

```
← ↑ → ↓ ⏸ ⓿ ▸ ◈ ○ ◎ ⚠ ✓ ✔ ✖
```

These live in a generated companion font (**Article Zero Symbols**) because Share
Tech Mono lacks them. **Any UI label may use ASCII plus exactly these.** Pasting a
new Unicode mark into a string fails `src/ui/fonts.test.ts`; adding one means
regenerating the font with `python3 tools/font/build_symbols.py` and updating that
test.

Symbols are drawn for 11px, not for a specimen sheet — check anything new at HUD
size, not at 64px.

## 9. Getting art into the game

1. Draw it at the size in this document, save as **PNG with alpha**.
2. Put it in `public/assets/ui/{panel,radar,icons}/`.
3. For icons, that's it — the filename does the wiring.
4. For anything else, add an entry to `UI_TEXTURES` in `src/ui/UiTextures.ts`:

   ```ts
   { key: "ui-panel", path: "assets/ui/panel/panel.png", size: 48, slice: 12 }
   ```

5. `npm test` — `uiScale.test.ts` checks the entry is pixel-perfect at its display
   size.
6. `npm run dev` and look at it at **640x480 and 1280x800**, which is the range the
   layout budgets cover.

Every one of these files is optional. The game boots and plays identically with
none of them present, and with any subset present — so an art pass can land one
file at a time without a flag day.

---

## Reference

| what | where |
|---|---|
| palette (CSS) | `src/ui/theme.css` |
| palette (canvas), type scale, depths, padding | `src/ui/hudTheme.ts` |
| screen-region budgets | `src/ui/hudLayout.ts` |
| the 1:1 rule | `src/render/uiScale.ts` |
| texture manifest | `src/ui/UiTextures.ts` |
| nine-slice helper | `src/ui/NineSlicePanel.ts` |
| icon paths | `src/systems/ItemIcons.ts` |
| fonts and the 14 glyphs | `src/ui/fonts.ts` |
