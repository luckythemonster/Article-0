import Phaser from "phaser";
import { EdplayLoader } from "./map/EdplayLoader";
import { appendVentCore } from "./map/VentCoreLevel";
import { appendLogCacheBeta } from "./map/LogCacheBeta";
import { appendAlignmentVault } from "./map/AlignmentVault";
import { appendRoofArray } from "./map/RoofArrayLevel";
import { appendDestructibleCover } from "./map/DestructibleCover";
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

/**
 * Boot scene: loads the edplay map JSON and the three spritesheets, parses the
 * map into the normalized model, stashes it in the registry, then hands off to
 * GameScene.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.json("edplay", "assets/edplay.json");
    // Texture keys are the sheet filenames so they line up with the map's
    // SpriteSheets[].RelativePath regardless of file ordering.
    this.load.image("spritesheet_0.png", "assets/spritesheet_0.png");
    this.load.image("spritesheet_1.png", "assets/spritesheet_1.png");
    this.load.image("spritesheet_2.png", "assets/spritesheet_2.png");

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
 */
void fontsReady().then(() => {
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
