import Phaser from "phaser";
import { EdplayLoader } from "./map/EdplayLoader";
import { appendVentCore } from "./map/VentCoreLevel";
import { appendLogCacheBeta } from "./map/LogCacheBeta";
import { appendAlignmentVault } from "./map/AlignmentVault";
import { appendRoofArray } from "./map/RoofArrayLevel";
import { appendDestructibleCover } from "./map/DestructibleCover";
import { graftExtractionEntrance } from "./map/AdoptAuthored";
import { planFor } from "./map/MapPlan";
import type { EdPlayFile } from "./map/types";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import { TitleScene } from "./scenes/TitleScene";
import { PauseScene } from "./scenes/PauseScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { TribunalScene } from "./scenes/TribunalScene";
import { CodecScene } from "./scenes/CodecScene";
import { ComplianceScene } from "./scenes/ComplianceScene";
import { QualiaLockScene } from "./scenes/QualiaLockScene";
import { fontsReady } from "./ui/fontsReady";
import "./ui/fonts.css";
import {
  PLAYER_ANIM_FRAME_COUNTS,
  playerFrameKey,
  playerFramePath,
  type PlayerAnimName,
} from "./entities/PlayerAnimations";
import { DIRS_8 } from "./entities/directions";
import { ENFORCER_SKIN } from "./entities/EnforcerAnimations";
import { DRONE_SKIN } from "./entities/DroneAnimations";
import { preloadGuardSkin } from "./entities/GuardSkin";
import { preloadOrderly } from "./entities/OrderlyAnimations";
import { preloadDeployedItems } from "./entities/DeployedItem";
import { preloadVfx } from "./entities/Vfx";
import { discoverUiTextures, preloadUiTextures } from "./ui/UiTextures";

/**
 * Boot scene: loads the edplay map JSON and its spritesheets, parses the map
 * into the normalized model, stashes it in the registry, then hands off to
 * GameScene.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.json("edplay", "assets/edplay.json");
    // Sheet count and names come from the map itself rather than a fixed list,
    // since edplay exports don't all ship the same number of sheets. Queuing these
    // off the json's own filecomplete event still runs them as part of this same
    // preload pass — Phaser folds files added during load into the active queue.
    this.load.once("filecomplete-json-edplay", () => {
      const raw = this.cache.json.get("edplay") as EdPlayFile;
      for (const sheet of raw.SpriteSheets) {
        // Texture keys are the sheet filenames so they line up with the map's
        // SpriteSheets[].RelativePath regardless of file ordering.
        this.load.image(sheet.RelativePath, `assets/${sheet.RelativePath}`);
      }
    });

    for (const anim of Object.keys(PLAYER_ANIM_FRAME_COUNTS) as PlayerAnimName[]) {
      for (const dir of DIRS_8) {
        const count = PLAYER_ANIM_FRAME_COUNTS[anim];
        for (let i = 0; i < count; i++) {
          this.load.image(playerFrameKey(anim, dir, i), playerFramePath(anim, dir, i));
        }
      }
    }

    preloadGuardSkin(this, ENFORCER_SKIN);
    preloadGuardSkin(this, DRONE_SKIN);
    preloadOrderly(this);
    preloadDeployedItems(this);
    preloadVfx(this);
    // Whichever optional HUD chrome was found before boot — see `UiTextures.ts`.
    preloadUiTextures(this);
  }

  create(): void {
    const raw = this.cache.json.get("edplay") as EdPlayFile;
    const sheetKeys = raw.SpriteSheets.map((s) => s.RelativePath);
    const parsed = EdplayLoader.parse(raw, sheetKeys);
    // Work out the map's shape — start, extraction, vent-core host — before generating
    // anything, so the generated arena can't influence the plan that decides where it goes.
    const plan = planFor(parsed.map);
    // The VENT-4 arena is engine-generated; it must join the map before the
    // first GameScene builds (and registry-caches) the TransitionGraph. Optional: a map
    // with no suitable host simply has no VENT-4.
    // Everything the engine grafts on has to join the map before the first GameScene
    // builds (and registry-caches) the TransitionGraph. Each one is optional and says so
    // by returning false — a map that can't host an act simply doesn't have it, and the
    // objectives, the codec and the win condition all read these flags rather than
    // assuming the shipped map's shape.
    const hasVentCore = appendVentCore(parsed.map, plan.ventCoreHost);
    // BETA shares the crawlspace the arena grafts onto: it is the maintenance deck that
    // is neither the start nor the destination, which is exactly what both want.
    const hasLogBeta = appendLogCacheBeta(parsed.map, plan.ventCoreHost);
    // The vault and the roof both hang off the extraction level — the Core stands in it,
    // and the roof is up a ladder from it.
    const hasVault = appendAlignmentVault(parsed.map, plan.extractionLevel);
    const hasRoof = appendRoofArray(parsed.map, plan.extractionLevel);
    // A map can author an extraction deck with no way in — NW-SMAC-01 does — which
    // strands the win condition. Runs after the acts so it sees every board they
    // added, and before the first GameScene caches the TransitionGraph.
    graftExtractionEntrance(parsed.map, plan.extractionLevel);
    // Best-effort: gives the destructible-cover mechanic something real to break in a
    // playthrough. Doesn't gate anything, so no flag is stashed for it.
    appendDestructibleCover(parsed.map, plan.startLevel);
    this.registry.set("mapPlan", plan);
    this.registry.set("hasVentCore", hasVentCore);
    this.registry.set("hasLogBeta", hasLogBeta);
    this.registry.set("hasVault", hasVault);
    this.registry.set("hasRoof", hasRoof);
    this.registry.set("parsedMap", parsed);
    this.scene.start("TitleScene");
  }
}

// Read the container's actual rendered size rather than the raw window
// dimensions, so the canvas matches the (deliberately smaller than full-window)
// #game element from the very first frame instead of a stale snapshot that
// can be clipped by browser chrome.
const gameEl = document.getElementById("game")!;

/**
 * Sizes the canvas host to whole pixels, and to the viewport's parity.
 *
 * `index.html` asks for `92vw x 92vh`, which on most windows is fractional: a
 * 640x480 viewport gives 588.8 x 441.6. Phaser's `RESIZE` mode then hands the
 * canvas a fractional CSS size over an integer backing store, and the browser
 * rescales the whole thing — with `image-rendering: pixelated`, that resamples
 * every row of every glyph. It shows up as HUD text with the tops sheared off
 * ("COMPLIANCE OK" rendering as "LUMPLIANLL UK"), which reads as a font bug and
 * is not one.
 *
 * Flooring the size fixes the stretch. Matching the viewport's parity fixes the
 * other half: the host is flex-centred, so an odd difference puts the canvas on a
 * half-pixel offset and resamples it again at that origin.
 *
 * This is also what the UI art guarantee rests on — `render/uiScale.ts` promises
 * one art pixel per screen pixel, and no amount of correctly-sized art survives a
 * canvas that is itself being scaled by 1.0014.
 */
function fitGameElement(): void {
  const fit = (viewport: number, max: number): number => {
    let size = Math.min(Math.floor(viewport * 0.92), max);
    if ((viewport - size) % 2 !== 0) size -= 1;
    return size;
  };
  gameEl.style.width = `${fit(window.innerWidth, 1280)}px`;
  gameEl.style.height = `${fit(window.innerHeight, 800)}px`;
}

fitGameElement();
window.addEventListener("resize", fitGameElement);

/**
 * Boot is deferred until the webfonts are resident.
 *
 * Phaser's `Text` rasterises to a canvas texture at construction and never
 * redraws when a font turns up later, so a scene built during the font load
 * bakes the fallback face in for the rest of the session — silently, with no
 * error and nothing to retry. `TitleScene.create()` runs almost immediately, so
 * this race is one the game loses on a cold cache without the wait.
 *
 * `fontsReady` fails open (and is bounded by its own timeout), so a blocked font
 * costs the player the typeface, never the game.
 *
 * `discoverUiTextures` rides along on the same wait — it asks which optional HUD
 * art exists so the loader is never handed a path that doesn't, and it fails open
 * the same way.
 */
void Promise.all([fontsReady(), discoverUiTextures()]).then(() => {
  const game = startGame();
  // Phaser is bundled rather than global, so `Phaser.GAMES` is not reachable
  // from the console or from a browser-driving script. Publish the instance in
  // dev builds only — Vite resolves `import.meta.env.DEV` to false for
  // production, so this drops out at build time.
  if (import.meta.env.DEV) {
    (window as unknown as { game: Phaser.Game }).game = game;
  }
});

function startGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#05070a",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: gameEl.clientWidth,
      height: gameEl.clientHeight,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scene: [
      BootScene,
      TitleScene,
      GameScene,
      UIScene,
      CodecScene,
      ComplianceScene,
      QualiaLockScene,
      PauseScene,
      GameOverScene,
      TribunalScene,
    ],
  });
}
