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

Every colour in the interface is an entry in **[ENDESGA-64][edg64]**, the 64-colour
palette the game's hand-drawn art is authored in. That constraint is the point: before
it, the UI mixed its own colours while the sprites used EDG64, so a panel drawn in
Aseprite could never quite sit beside a HUD drawn in canvas.

`src/ui/theme.css` is the single source of truth, mirrored for canvas code in
`src/ui/hudTheme.ts` and checked by `hudTheme.test.ts`. **Use these values and no
others.** A GUI sprite introducing its own blue is the thing this guide most wants
to prevent — the HUD spent a while with four slightly different greys before the
tokens existed.

If a token seems to want a colour EDG64 doesn't have, the token is wrong — don't
extend the palette.

[edg64]: https://lospec.com/palette-list/endesga-64

**Accents** — these carry meaning, don't use them decoratively:

| token | hex | means |
|---|---|---|
| `--c-cyan` | `#00cdf9` | the interface itself; nominal state |
| `--c-cyan-bright` | `#0cf1ff` | emphasis on cyan |
| `--c-amber` | `#ffa214` | caution — evasion, flagged conduct |
| `--c-amber-bright` | `#ffeb57` | guard blips |
| `--c-red` | `#f5555d` | jammed, degraded |
| `--c-red-deep` | `#ea323c` | alert |
| `--c-green` | `#5ac54f` | healthy |
| `--c-green-soft` | `#99e65f` | the Shared Field's "we" |
| `--c-blue-soft` | `#94fdff` | compliant, passing as staff |

**Surfaces and structure:**

| token | hex | use |
|---|---|---|
| `--c-bg-void` | `#0e071b` | what the canvas clears to |
| `--c-bg-panel` | `#1a1932` | panel interiors |
| `--c-bg-scope` | `#131313` | the radar's well |
| `--c-track` | `#0c2e44` | empty bar tracks |
| `--c-border` | `#0069aa` | lit border |
| `--c-border-cool` | `#424c6e` | the default border |
| `--c-border-dim` | `#2a2f4e` | recessed border |

**Text ramp**, brightest to faintest: `#ffffff` `#c7cfdd` `#b4b4b4` `#92a1b9`
`#858585` `#657392` `#5d5d5d` `#3d3d3d`. EDG64's slate ramp gives five usable
steps and the HUD needs eight, so its neutral greys fill the gaps — the ramp
alternates hue but its luminance descends strictly, which is what the eye reads.

The canvas clears to `--c-bg-void`, darker than any panel — panels should read as
lighter than the void behind them, never darker. The four surface tokens are
ordered by luminance (11 → 19 → 28 → 40) so that stays true by construction.

Two consequences of the EDG64 move worth knowing. The **lit border is blue, not
teal**: EDG64's teals (`#134c4c`, `#1e6f50`) both fall below `--c-border-cool`,
which would invert the lit > cool > dim ordering those three names depend on.
And `--c-green` is a true green rather than the old mint, so "healthy" and the
Shared Field's `--c-green-soft` now separate by hue as well as brightness.

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

**Still needing redrawing**: `Q0_certification`, `access_chit`, `battery`, `disk`,
`flashlight-off`, `flashlight-on`, `medkit`, `thermal_gel`. `sack_lunch` was
authored at size and is already correct; `EMP_grenade` has been redrawn and lives
at `public/assets/ui/icons/EMP_grenade.png`.

**Items with no icon at all** — the backlog: Stun Rounds, the Pneumatic
Rail-Stapler, and the two LOG_CACHE fragments.

## 6. The two round instruments

The HUD has two circular scopes, and they are deliberately a matched pair — the
radar's bezel and the bio dial's are drawn the same way so they read as a family
rather than a coincidence. Both take a bezel sprite on the same terms.

| | radar | bio-integrity dial |
|---|---|---|
| where | top-right | top-left, under `BIO-INTEGRITY` |
| source | **96x96** | **80x80** |
| radius | 46 | 40 |
| key | `ui-radar-bezel` | `ui-vitals-bezel` |

**The interior of both must be transparent.** Each scope's contents are drawn on a
separate layer *underneath* the bezel — the radar's terrain and blips through a
geometry mask, the dial's face and EKG trace directly. Anything opaque inside the
ring hides them rather than sitting behind them.

Both currently draw as a 2px `--c-border-cool` circle. A sprite can add bezel depth,
tick marks, a bearing scale, screw heads — as long as it stays inside the source size
and leaves the middle clear.

## 7. What not to draw

These are generated at runtime and would be wasted effort:

- **Light cones and the flashlight falloff** — `src/ui/Lighting.ts`, procedural.
- **Radial light stamps** — `src/render/stamps.ts`, generated at 256px.
- **Radar blips, the sweep, terrain dots and the jam static** — all drawn per frame
  from live game state, and the static is deliberately re-randomised every frame.
- **The EKG trace** — the waveform on the bio dial is a model (`src/ui/ekg.ts`), not
  art: the rate climbs and the complex shrinks with health, and at zero it flatlines
  and the alarm pulses. Draw the *bezel* around it, never the trace itself.
- **Bars and gauges** — the SRP meter and the Shared Field gauge stay as primitives
  for now.

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
| the two round instruments | `src/ui/Radar.ts`, `src/ui/BioMonitor.ts` |
| the EKG waveform model | `src/ui/ekg.ts` |
