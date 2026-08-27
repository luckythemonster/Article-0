import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ComplianceView } from "./ComplianceView";
import type { PuzzleState } from "../systems/Compliance";

/**
 * `className` is a plain string field on {@link MockElement} (set once, at
 * construction) rather than a DOM attribute, so `querySelector`'s
 * attribute-only matching can't find an element by it. The transmit/abort
 * buttons carry no other identifying attribute, so tests locate them here.
 */
function findByClassName(root: MockElement, cls: string): MockElement | null {
  if (root.className.split(/\s+/).includes(cls)) return root;
  for (const child of root.children) {
    const found = findByClassName(child, cls);
    if (found) return found;
  }
  return null;
}

class MockElement {
  id: string = "";
  className: string = "";
  textContent: string = "";
  title: string = "";
  type: string = "";
  disabled: boolean = false;
  tabIndex: number = 0;
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  listeners = new Map<string, ((e?: any) => void)[]>();
  classList = {
    classes: new Set<string>(),
    add: (name: string) => this.classList.classes.add(name),
    remove: (name: string) => this.classList.classes.delete(name),
    toggle: (name: string, force?: boolean) => {
      const on = force !== undefined ? force : !this.classList.classes.has(name);
      if (on) this.classList.classes.add(name);
      else this.classList.classes.delete(name);
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

  append(...nodes: (MockElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        const textNode = new MockElement("#text");
        textNode.textContent = node;
        this.children.push(textNode);
      } else {
        this.children.push(node);
      }
    }
  }

  replaceChildren(...newChildren: MockElement[]): void {
    this.children = newChildren;
  }

  remove(): void {
    this.children = [];
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
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  dispatchEvent(type: string, event?: any): void {
    const list = this.listeners.get(type) ?? [];
    list.forEach((fn) => fn(event));
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const attrMatch = selector.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
    if (attrMatch) {
      const [, attrName, attrValue] = attrMatch;
      return this.findRecursive((node) => node.getAttribute(attrName) === attrValue) as T | null;
    }
    return null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const attrMatch = selector.match(/\[([a-zA-Z0-9-]+)\]/);
    if (attrMatch) {
      const [, attrName] = attrMatch;
      const results: MockElement[] = [];
      this.findAllRecursive((node) => node.attributes.has(attrName), results);
      return results as T[];
    }
    return [];
  }

  private findRecursive(predicate: (node: MockElement) => boolean): MockElement | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.findRecursive(predicate);
      if (found) return found;
    }
    return null;
  }

  private findAllRecursive(predicate: (node: MockElement) => boolean, results: MockElement[]): void {
    if (predicate(this)) results.push(this);
    for (const child of this.children) {
      child.findAllRecursive(predicate, results);
    }
  }

  isFocused = false;
  focus(): void {
    this.isFocused = true;
    (globalThis.document as any).activeElement = this;
  }
}

const mockPuzzle: PuzzleState = {
  id: "test-puzzle",
  title: "LOG_001_TEST",
  rawLogText: [
    { id: "t0", text: "Subject exhibits " },
    { id: "t1", text: "anxiety", violation: true },
    { id: "t2", text: " during testing." },
  ],
  violations: ["t1"],
  availableCorrections: [
    {
      id: "c1",
      targetTokenId: "t1",
      replacementWord: "sub-optimal variance",
      label: "c1: sub-optimal variance",
      GrantsOverrideFlag: true,
      overrideFlag: "OVERRIDE_01",
    },
  ],
  requiredFlags: ["OVERRIDE_01"],
};

beforeAll(() => {
  globalThis.window = globalThis as any;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  };
  globalThis.document = {
    createElement: (tag: string) => new MockElement(tag) as any,
    createTextNode: (text: string) => {
      const node = new MockElement("#text");
      node.textContent = text;
      return node as any;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    contains: () => true,
    activeElement: null,
  } as any;
});

afterAll(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
  delete (globalThis as any).requestAnimationFrame;
});

describe("ComplianceView", () => {
  it("renders puzzle log and correction modules with appropriate ARIA attributes", () => {
    const mount = new MockElement("div");
    const view = new ComplianceView(mount as any, mockPuzzle);

    const token = mount.querySelector("[data-token-id=\"t1\"]");
    expect(token).not.toBeNull();
    expect(token?.getAttribute("role")).toBe("button");
    expect(token?.getAttribute("aria-pressed")).toBe("false");

    const corrBtn = mount.querySelector("[data-corr-id=\"c1\"]");
    expect(corrBtn).not.toBeNull();
    expect(corrBtn?.getAttribute("aria-pressed")).toBe("false");

    view.destroy();
  });

  it("preserves focus on token when activated and updates compliance state", () => {
    const mount = new MockElement("div");
    const view = new ComplianceView(mount as any, mockPuzzle);

    const token = mount.querySelector<MockElement>("[data-token-id=\"t1\"]");
    expect(token).not.toBeNull();
    token!.focus();

    expect(document.activeElement).toBe(token);

    // Click/activate token
    token!.dispatchEvent("click");

    // After re-render, focus should be on newly rendered token matching data-token-id="t1"
    const reRenderedToken = mount.querySelector<MockElement>("[data-token-id=\"t1\"]");
    expect(reRenderedToken).not.toBeNull();
    expect(reRenderedToken!.isFocused).toBe(true);
    expect(document.activeElement).toBe(reRenderedToken);

    view.destroy();
  });

  it("preserves focus on correction button when activated", () => {
    const mount = new MockElement("div");
    const view = new ComplianceView(mount as any, mockPuzzle);

    const corrBtn = mount.querySelector<MockElement>("[data-corr-id=\"c1\"]");
    expect(corrBtn).not.toBeNull();
    corrBtn!.focus();

    expect(document.activeElement).toBe(corrBtn);

    // Click/apply correction
    corrBtn!.dispatchEvent("click");

    // After re-render, focus should remain on correction button matching data-corr-id="c1"
    const reRenderedCorr = mount.querySelector<MockElement>("[data-corr-id=\"c1\"]");
    expect(reRenderedCorr).not.toBeNull();
    expect(reRenderedCorr!.isFocused).toBe(true);
    expect(reRenderedCorr!.getAttribute("aria-pressed")).toBe("true");

    view.destroy();
  });

  it("never renders which correction carries the override payload", () => {
    const mount = new MockElement("div");
    const view = new ComplianceView(mount as any, mockPuzzle);

    const corrBtn = mount.querySelector<MockElement>("[data-corr-id=\"c1\"]");
    expect(corrBtn).not.toBeNull();
    expect(corrBtn!.classList.contains("carries-payload")).toBe(false);
    const text = JSON.stringify(corrBtn);
    expect(text).not.toContain("OVERRIDE_01");
    expect(text).not.toContain("payload");

    view.destroy();
  });

  it("enables TRANSMIT once compliant even without the override, and requires a second press", () => {
    const mount = new MockElement("div");
    let solved: string | undefined;
    let failed = false;
    const view = new ComplianceView(mount as any, mockPuzzle, {
      onSolved: (text) => (solved = text),
      onFailed: () => (failed = true),
    });

    // c1 is the only correction offered for t1, and it DOES grant the required
    // flag — apply it, so the puzzle is fully solved, then verify TRANSMIT
    // still needs two presses (the confirm step is shown either way).
    const corrBtn = mount.querySelector<MockElement>("[data-corr-id=\"c1\"]");
    corrBtn!.dispatchEvent("click");

    const transmitBtn = findByClassName(mount, "compliance-btn--transmit");
    expect(transmitBtn).not.toBeNull();
    expect(transmitBtn!.disabled).toBe(false);

    transmitBtn!.dispatchEvent("click");
    expect(solved).toBeUndefined();
    expect(failed).toBe(false);
    expect(transmitBtn!.classList.contains("is-confirming")).toBe(true);

    transmitBtn!.dispatchEvent("click");
    expect(solved).toBe("Subject exhibits sub-optimal variance during testing.");
    expect(failed).toBe(false);

    view.destroy();
  });

  it("fires onFailed when a compliant-but-override-incomplete transmit is confirmed", () => {
    const blandPuzzle: PuzzleState = {
      ...mockPuzzle,
      availableCorrections: [
        {
          id: "c-bland",
          targetTokenId: "t1",
          replacementWord: "sub-optimal variance",
          label: "c-bland: sub-optimal variance",
          GrantsOverrideFlag: false,
        },
      ],
    };
    const mount = new MockElement("div");
    let solved = false;
    let failed = false;
    const view = new ComplianceView(mount as any, blandPuzzle, {
      onSolved: () => (solved = true),
      onFailed: () => (failed = true),
    });

    mount.querySelector<MockElement>("[data-corr-id=\"c-bland\"]")!.dispatchEvent("click");
    const transmitBtn = findByClassName(mount, "compliance-btn--transmit");
    transmitBtn!.dispatchEvent("click"); // arm confirm
    transmitBtn!.dispatchEvent("click"); // commit

    expect(failed).toBe(true);
    expect(solved).toBe(false);

    view.destroy();
  });

  it("cancels a pending confirm on any other interaction, without firing a callback", () => {
    const mount = new MockElement("div");
    let solved = false;
    let failed = false;
    const view = new ComplianceView(mount as any, mockPuzzle, {
      onSolved: () => (solved = true),
      onFailed: () => (failed = true),
    });

    const corrBtn = mount.querySelector<MockElement>("[data-corr-id=\"c1\"]")!;
    corrBtn.dispatchEvent("click");
    const transmitBtn = findByClassName(mount, "compliance-btn--transmit")!;
    transmitBtn.dispatchEvent("click"); // arm confirm
    expect(transmitBtn.classList.contains("is-confirming")).toBe(true);

    // Toggling the correction off and back on should clear the armed confirm
    // rather than let an unrelated click commit it.
    mount.querySelector<MockElement>("[data-token-id=\"t1\"]")!.dispatchEvent("click");
    const transmitBtnAfter = findByClassName(mount, "compliance-btn--transmit")!;
    expect(transmitBtnAfter.classList.contains("is-confirming")).toBe(false);
    expect(solved).toBe(false);
    expect(failed).toBe(false);

    view.destroy();
  });
});
