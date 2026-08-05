import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SelectList, type SelectListRow } from "./SelectList";

// Stub a minimal DOM for Vitest running in Node.
class MockElement {
  id: string = "";
  className: string = "";
  textContent: string = "";
  tabIndex: number = 0;
  attributes = new Map<string, string>();
  children: MockElement[] = [];
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

  replaceChildren(...newChildren: MockElement[]): void {
    this.children = newChildren;
  }

  addEventListener(type: string, listener: (e?: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  scrollIntoView(): void {}
}

beforeAll(() => {
  globalThis.document = {
    createElement: (tag: string) => new MockElement(tag) as any,
  } as any;
});

afterAll(() => {
  delete (globalThis as any).document;
});

describe("SelectList", () => {
  it("initializes and sets rows, defaulting selection to first enabled row", () => {
    let changedIndex = -1;
    const list = new SelectList((idx) => {
      changedIndex = idx;
    }, "Test List");

    const rows: SelectListRow[] = [
      { label: "Header", disabled: true },
      { label: "Option 1" },
      { label: "Option 2" },
    ];

    list.setRows(rows);

    expect(list.selected).toBe(1); // First non-disabled row is index 1
    expect(changedIndex).toBe(1);
    expect(list.node.getAttribute("role")).toBe("listbox");
    expect(list.node.getAttribute("aria-label")).toBe("Test List");
  });

  it("navigates down and up, skipping disabled rows", () => {
    const list = new SelectList(() => {}, "Test Navigation");
    const rows: SelectListRow[] = [
      { label: "Option 1" },
      { label: "Disabled Gap", disabled: true },
      { label: "Option 2" },
      { label: "Disabled Gap 2", disabled: true },
    ];

    list.setRows(rows);
    expect(list.selected).toBe(0);

    // Move down - should skip index 1 and go to 2
    list.move(1);
    expect(list.selected).toBe(2);

    // Move down again - should try to go to 3, but it's disabled and end of list, so stay at 2
    list.move(1);
    expect(list.selected).toBe(2);

    // Move up - should skip 1 and go back to 0
    list.move(-1);
    expect(list.selected).toBe(0);
  });

  it("handles Home key correctly", () => {
    const list = new SelectList(() => {}, "Test Home");
    const rows: SelectListRow[] = [
      { label: "Header", disabled: true },
      { label: "Option 1" },
      { label: "Option 2" },
    ];

    list.setRows(rows);
    list.select(2);
    expect(list.selected).toBe(2);

    const consumed = list.onKey({ key: "Home" } as KeyboardEvent);
    expect(consumed).toBe(true);
    expect(list.selected).toBe(1); // First non-disabled is index 1
  });

  it("handles End key correctly when last elements are disabled", () => {
    const list = new SelectList(() => {}, "Test End");
    const rows: SelectListRow[] = [
      { label: "Option 1" },
      { label: "Option 2" },
      { label: "Footer Header", disabled: true },
      { label: "Footer", disabled: true },
    ];

    list.setRows(rows);
    expect(list.selected).toBe(0);

    const consumed = list.onKey({ key: "End" } as KeyboardEvent);
    expect(consumed).toBe(true);
    expect(list.selected).toBe(1); // Last non-disabled is index 1
  });

  it("handles End key correctly when last element is enabled", () => {
    const list = new SelectList(() => {}, "Test End 2");
    const rows: SelectListRow[] = [
      { label: "Option 1" },
      { label: "Disabled Header", disabled: true },
      { label: "Option 2" },
    ];

    list.setRows(rows);
    expect(list.selected).toBe(0);

    const consumed = list.onKey({ key: "End" } as KeyboardEvent);
    expect(consumed).toBe(true);
    expect(list.selected).toBe(2); // Last non-disabled is index 2
  });
});
