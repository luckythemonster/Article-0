import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from "./Settings";
import { installBlockedStorage, installMemStorage } from "../testing/memStorage";

beforeEach(installMemStorage);

describe("Settings", () => {
  it("defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores inherited prototype properties to protect against prototype pollution", () => {
    const malicious = Object.create({ masterVolume: 0.5, muted: true });
    // malicious has masterVolume and muted on its prototype, not as own properties.
    const normalized = normalizeSettings(malicious);
    expect(normalized).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a preference", () => {
    saveSettings({ masterVolume: 0.4, muted: true });
    expect(loadSettings()).toEqual({ masterVolume: 0.4, muted: true });
  });

  it("clamps the volume into range on the way in and out", () => {
    expect(normalizeSettings({ masterVolume: 4, muted: false }).masterVolume).toBe(1);
    expect(normalizeSettings({ masterVolume: -3, muted: false }).masterVolume).toBe(0);
    // A hand-edited blob must not leave the mixer silent behind a healthy slider.
    localStorage.setItem("article-zero-settings", JSON.stringify({ masterVolume: -3, muted: false }));
    expect(loadSettings().masterVolume).toBe(0);
  });

  it("falls back to defaults for junk fields rather than throwing", () => {
    expect(normalizeSettings({ masterVolume: "loud", muted: "yes" })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ masterVolume: Number.NaN, muted: false }).masterVolume).toBe(1);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem("article-zero-settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("survives storage being unavailable", () => {
    installBlockedStorage();
    expect(() => saveSettings({ masterVolume: 0.5, muted: false })).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
