import Phaser from "phaser";
import { EdplayLoader } from "./map/EdplayLoader";
import type { EdPlayFile } from "./map/types";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import {
  PLAYER_ANIM_DIRS,
  PLAYER_ANIM_FRAME_COUNTS,
  playerFrameKey,
  playerFramePath,
  type PlayerAnimName,
} from "./entities/PlayerAnimations";
import {
  ENFORCER_ANIM_DIRS,
  ENFORCER_PATROL_FRAME_COUNT,
  enforcerFrameKey,
  enforcerFramePath,
} from "./entities/EnforcerAnimations";

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

    for (const dir of ENFORCER_ANIM_DIRS) {
      for (let i = 0; i < ENFORCER_PATROL_FRAME_COUNT; i++) {
        this.load.image(enforcerFrameKey(dir, i), enforcerFramePath(dir, i));
      }
    }
  }

  create(): void {
    const raw = this.cache.json.get("edplay") as EdPlayFile;
    const sheetKeys = raw.SpriteSheets.map((s) => s.RelativePath);
    const parsed = EdplayLoader.parse(raw, sheetKeys);
    this.registry.set("parsedMap", parsed);
    this.scene.start("GameScene");
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#05070a",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [BootScene, GameScene, UIScene],
});
