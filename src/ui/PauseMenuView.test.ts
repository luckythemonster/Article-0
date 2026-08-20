import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PauseMenuView, type PauseSnapshot, type PauseCallbacks } from "./PauseMenuView";
import { initialObjectives } from "../systems/Objectives";
import { DEFAULT_SETTINGS } from "../systems/Settings";

// Stub a minimal DOM for Vitest running in Node.
class MockElement {
  id: string = "";
  className: string = "";
  textContent: string = "";
  tabIndex: number = 0;
  type: string = "";
  checked: boolean = false;
  min: string = "0";
  max: string = "100";
  step: string = "1";
  value: string = "0";
  htmlFor: string = "";
  src: string = "";
  alt: string = "";
  clientWidth: number = 420;
  clientHeight: number = 260;
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  style: Record<string, string> = {};
  listeners = new Map<string, ((e?: any) => void)[]>();
  classList = {
    classes: new Set<string>(),
    toggle: (name: string, force?: boolean) => {
      const on = force !== undefined ? force : !this.classList.classes.has(name);
      if (on) {
        this.classList.classes.add(name);
      } else {
        this.classList.classes.delete(name);
      }
    },
    contains: (name: string) => this.classList.classes.has(name),
  };

  constructor(public tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: MockElement): void {
    this.children.push(child);
  }

  append(...children: (MockElement | string)[]): void {
    for (const child of children) {
      if (typeof child === "string") {
        const textNode = new MockElement("span");
        textNode.textContent = child;
        this.appendChild(textNode);
      } else {
        this.appendChild(child);
      }
    }
  }

  replaceChildren(...newChildren: MockElement[]): void {
    this.children = newChildren;
  }

  addEventListener(type: string, listener: (e?: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (e?: any) => void): void {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(
        type,
        list.filter((l) => l !== listener),
      );
    }
  }

  getContext(): any {
    return {
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: () => {},
      drawImage: () => {},
      setTransform: () => {},
    };
  }

  remove(): void {}
  focus(): void {}
}

beforeAll(() => {
  globalThis.document = {
    createElement: (tag: string) => new MockElement(tag) as any,
    createElementNS: (_ns: string, tag: string) => new MockElement(tag) as any,
    activeElement: null,
    contains: () => true,
  } as any;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    cb(performance.now());
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  globalThis.window = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  } as any;
});

afterAll(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
  delete (globalThis as any).requestAnimationFrame;
  delete (globalThis as any).cancelAnimationFrame;
});

// Mock frame creation to avoid SVG DOM complexities in Node environment
vi.mock("./frame", () => ({
  createPanelFrame: () => ({
    svg: new MockElement("svg"),
    mount: () => ({ remove: () => {} }),
  }),
}));

function mockSnapshot(): PauseSnapshot {
  return {
    objectives: initialObjectives(),
    currentLevel: "main1",
    features: {
      hasVentCore: false,
      hasLogBeta: false,
      hasVault: false,
      hasRoof: false,
      extractionLevel: "main2",
    },
    inventory: ["EMP Grenade", "Medkit"],
    active: {
      chaffRemaining: 0,
      thermalRemaining: 0,
      flashlightOwned: true,
      flashlightOn: false,
      flashlightCharge: 1.0,
      sackLunchOpened: false,
    },
    journal: { unlocked: ["orders"] },
    hp: 100,
    maxHp: 100,
    detection: 0,
    alertPhase: "INFILTRATION",
    playTimeMs: 123456,
    saves: [
      { slot: "auto", data: null },
      { slot: "1", data: null },
      { slot: "2", data: null },
      { slot: "3", data: null },
    ],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function mockCallbacks(): PauseCallbacks {
  return {
    onResume: () => {},
    onSave: () => {},
    onLoad: () => {},
    onQuit: () => {},
    onSettings: () => {},
  };
}

function findElementsByClass(root: MockElement, className: string): MockElement[] {
  const result: MockElement[] = [];
  if (root.className && root.className.split(" ").includes(className)) {
    result.push(root);
  }
  for (const child of root.children) {
    result.push(...findElementsByClass(child, className));
  }
  return result;
}

describe("PauseMenuView ARIA live attributes", () => {
  it("sets aria-live='polite' and aria-atomic='true' on split-pane detail containers", () => {
    const mount = new MockElement("div");
    const view = new PauseMenuView(mount as any, mockSnapshot(), mockCallbacks());

    const panes = (view as any).panes as { node: MockElement }[];
    const details: MockElement[] = [];
    for (const pane of panes) {
      details.push(...findElementsByClass(pane.node, "pause-detail"));
    }

    expect(details.length).toBe(3); // Journal, Inventory, and Index panes

    for (const detail of details) {
      expect(detail.getAttribute("aria-live")).toBe("polite");
      expect(detail.getAttribute("aria-atomic")).toBe("true");
    }

    view.destroy();
  });
});
