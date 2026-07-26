import Phaser from "phaser";
import { EdplayLoader } from "./map/EdplayLoader";
import { appendVentCore } from "./map/VentCoreLevel";
import { planFor } from "./map/MapPlan";
import type { EdPlayFile } from "./map/types";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import { TitleScene } from "./scenes/TitleScene";
import { PauseScene } from "./scenes/PauseScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { VictoryScene } from "./scenes/VictoryScene";
import { CodecScene } from "./scenes/CodecScene";
import { ComplianceScene } from "./scenes/ComplianceScene";
import { QualiaLockScene } from "./scenes/QualiaLockScene";
import { fontsReady } from "./ui/fontsReady";
import "./ui/fonts.css";
import {
  PLAYER_ANIM_DIRS,
  PLAYER_ANIM_FRAME_COUNTS,
  playerFrameKey,
  playerFramePath,
  type PlayerAnimName,
} from "./entities/PlayerAnimations";
import { ENFORCER_SKIN } from "./entities/EnforcerAnimations";
import { DRONE_SKIN } from "./entities/DroneAnimations";
import { preloadGuardSkin } from "./entities/GuardSkin";
import { preloadOrderly } from "./entities/OrderlyAnimations";

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
      for (const dir of PLAYER_ANIM_DIRS) {
        const count = PLAYER_ANIM_FRAME_COUNTS[anim];
        for (let i = 0; i < count; i++) {
          this.load.image(playerFrameKey(anim, dir, i), playerFramePath(anim, dir, i));
        }
      }
    }

    preloadGuardSkin(this, ENFORCER_SKIN);
    preloadGuardSkin(this, DRONE_SKIN);
    preloadOrderly(this);
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
    const hasVentCore = appendVentCore(parsed.map, plan.ventCoreHost);
    this.registry.set("mapPlan", plan);
    this.registry.set("hasVentCore", hasVentCore);
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
void fontsReady().then(() => startGame());

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
      VictoryScene,
    ],
  });
}
