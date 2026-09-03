import { describe, it, expect, vi } from "vitest";
import type Phaser from "phaser";
// Mock DOM objects for Phaser
(globalThis as any).window = globalThis;
(globalThis as any).document = {
  createElement: () => ({ style: {} }),
  readyState: "complete",
};
(globalThis as any).HTMLElement = class {};
(globalThis as any).navigator = { userAgent: "node" };

import { Orderly, type OrderlyContext } from "./Orderly";
import { CollisionGrid } from "../systems/CollisionGrid";
import type { GameLevel } from "../map/types";
import { ORDERLY_COLLISION_RADIUS_TILES } from "../systems/EntityStats";

const TILE = 32;

/**
 * A minimal scene stand-in that returns dummy sprites and texts,
 * and tracks animations so we don't throw.
 */
function fakeScene(): Phaser.Scene {
  const anims = new Set<string>();
  return {
    anims: {
      exists: (key: string) => anims.has(key),
      create: (config: any) => anims.add(config.key),
    },
    add: {
      sprite: () => {
        let currentKey = "";
        const mockSprite = {
          setDepth: function () { return this; },
          setScale: function () { return this; },
          play: function (key: string) { currentKey = key; return this; },
          setPosition: function () { return this; },
          setVisible: function () { return this; },
          setTint: function () { return this; },
          clearTint: function () { return this; },
          anims: {
            get currentAnim() { return { key: currentKey }; }
          }
        };
        return mockSprite;
      },
      text: () => {
        const mockText = {
          setOrigin: function () { return this; },
          setDepth: function () { return this; },
          setVisible: function () { return this; },
          setPosition: function () { return this; },
          setText: function () { return this; },
          text: ""
        };
        return mockText;
      },
    },
  } as unknown as Phaser.Scene;
}

/**
 * A minimal grid for line of sight that can answer yes or no.
 * By default it sees everything.
 */
function fakeGrid(sees: boolean = true): CollisionGrid {
  return {
    hasLineOfSight: () => sees,
    isBlocked: () => false,
  } as unknown as CollisionGrid;
}

function fakeContext(overrides: Partial<OrderlyContext> = {}): OrderlyContext {
  return {
    grid: fakeGrid(),
    tileSize: TILE,
    player: { x: 0, y: 0 },
    playerConcealed: false,
    playerCompliant: false,
    ...overrides
  };
}

describe("Orderly", () => {
  describe("initialization", () => {
    it("starts ready to witness and not immobilized", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      expect(orderly.isImmobilized).toBe(false);
      expect(orderly.isStunned).toBe(false);
      expect(orderly.isPinned).toBe(false);
      expect(orderly.isSurrendered).toBe(false);
      expect(orderly.isStashed).toBe(false);
      expect(orderly.canSurrender).toBe(true);

      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });
      expect(orderly.canWitness(ctx)).toBe(true);
    });
  });

  describe("immobilization (stun and pin)", () => {
    it("stun freezes the orderly and prevents witnessing", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.stun(5);

      expect(orderly.isStunned).toBe(true);
      expect(orderly.isImmobilized).toBe(true);
      expect(orderly.canSurrender).toBe(false);

      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });
      expect(orderly.canWitness(ctx)).toBe(false);

      // Update ticks down stun timer
      orderly.update(1, ctx);
      expect(orderly.isStunned).toBe(true);
      orderly.update(5, ctx);
      expect(orderly.isStunned).toBe(false);
    });

    it("pin freezes the orderly and prevents witnessing", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.pin(5);

      expect(orderly.isPinned).toBe(true);
      expect(orderly.isImmobilized).toBe(true);
      expect(orderly.canSurrender).toBe(false);

      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });
      expect(orderly.canWitness(ctx)).toBe(false);
    });
  });

  describe("surrender", () => {
    it("putting hands up prevents witnessing but is not considered 'immobilized'", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.handsUp(5);

      expect(orderly.isSurrendered).toBe(true);
      expect(orderly.isImmobilized).toBe(false); // See Orderly.ts state union docs
      expect(orderly.canSurrender).toBe(true); // Technically already surrendered, but still eligible

      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });
      expect(orderly.canWitness(ctx)).toBe(false);
    });

    it("ends surrender when stunned or pinned", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.handsUp(5);
      expect(orderly.isSurrendered).toBe(true);

      orderly.stun(5);
      expect(orderly.isSurrendered).toBe(false); // Stun drops the hands up state
      expect(orderly.isStunned).toBe(true);
    });

    it("refuses to surrender if already witnessed", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });

      // Force witness
      const witnessed = orderly.update(0.1, ctx);
      expect(witnessed).toBe(true);
      expect(orderly.canWitness(ctx)).toBe(false); // Already witnessed
      expect(orderly.canSurrender).toBe(false);

      orderly.handsUp(5);
      expect(orderly.isSurrendered).toBe(false); // Refused
    });
  });

  describe("stashing", () => {
    it("can be carried when immobilized and not stashed", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      expect(orderly.isCarryable).toBe(false);

      orderly.stun(5);
      expect(orderly.isCarryable).toBe(true);

      orderly.setStashed(true);
      expect(orderly.isStashed).toBe(true);
      expect(orderly.isCarryable).toBe(false);
    });

    it("timers continue to run while stashed", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.stun(5);
      orderly.setStashed(true);

      const ctx = fakeContext();
      orderly.update(6, ctx); // Run past stun time

      expect(orderly.isStunned).toBe(false);
      expect(orderly.isStashed).toBe(true); // Still stashed
    });
  });

  describe("distraction", () => {
    it("distract accepts a target and returns true when in WANDER", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      expect(orderly.distract(100, 100)).toBe(true);
    });

    it("distract is refused when immobilized", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.stun(5);
      expect(orderly.distract(100, 100)).toBe(false);
    });

    it("distract is refused when surrendered", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      orderly.handsUp(5);
      expect(orderly.distract(100, 100)).toBe(false);
    });
  });

  describe("witnessing and sight", () => {
    it("witnesses the player when in line of sight", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      const ctx = fakeContext({ player: { x: orderly.x, y: orderly.y } });

      expect(orderly.canWitness(ctx)).toBe(true);
      expect(orderly.update(0.1, ctx)).toBe(true);
    });

    it("does not witness if player is concealed", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      const ctx = fakeContext({
        player: { x: orderly.x, y: orderly.y },
        playerConcealed: true
      });

      expect(orderly.canWitness(ctx)).toBe(false);
      expect(orderly.update(0.1, ctx)).toBe(false);
    });

    it("does not witness if player is compliant", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      const ctx = fakeContext({
        player: { x: orderly.x, y: orderly.y },
        playerCompliant: true
      });

      expect(orderly.canWitness(ctx)).toBe(false);
      expect(orderly.update(0.1, ctx)).toBe(false);
    });

    it("delays witnessing with ration spoof", () => {
      const orderly = new Orderly(fakeScene(), 10, 10, TILE);
      const ctx = fakeContext({
        player: { x: orderly.x, y: orderly.y },
        rationSpoof: true
      });

      // Initial tick doesn't witness because spoof is active
      expect(orderly.update(0.1, ctx)).toBe(false);

      // Update spoof over RATION_SPOOF_SECONDS (default is 5.0)
      expect(orderly.update(6.0, ctx)).toBe(true);
    });
  });
});
