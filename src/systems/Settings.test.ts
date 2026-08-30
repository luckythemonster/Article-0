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

  it("safeguards against prototype and constructor property pollution injections", () => {
    const malicious = {
      masterVolume: 0.8,
      muted: false,
      __proto__: { polluted: true },
      constructor: { prototype: { compromised: true } },
    };
    const normalized = normalizeSettings(malicious);
    expect(normalized).toEqual({ masterVolume: 0.8, muted: false, narrateCodec: true });
    expect((normalized as any).polluted).toBeUndefined();
    expect((normalized as any).compromised).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(normalized, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalized, "constructor")).toBe(false);
  });

  it("round-trips a preference", () => {
    saveSettings({ masterVolume: 0.4, muted: true, narrateCodec: false });
    expect(loadSettings()).toEqual({ masterVolume: 0.4, muted: true, narrateCodec: false });
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

  it("narrates the codec by default", () => {
    expect(DEFAULT_SETTINGS.narrateCodec).toBe(true);
    expect(loadSettings().narrateCodec).toBe(true);
  });

  it("turns narration on for a blob written before the setting existed", () => {
    // Every stored preference predates this field, so absence is the ordinary
    // case rather than a corrupt one — those players should get the feature.
    localStorage.setItem("article-zero-settings", JSON.stringify({ masterVolume: 0.6, muted: false }));
    expect(loadSettings()).toEqual({ masterVolume: 0.6, muted: false, narrateCodec: true });
  });

  it("keeps narration off once it has been turned off", () => {
    // The one direction that matters: a default of `true` must not overwrite a
    // deliberate `false` on the way back in.
    localStorage.setItem(
      "article-zero-settings",
      JSON.stringify({ masterVolume: 1, muted: false, narrateCodec: false }),
    );
    expect(loadSettings().narrateCodec).toBe(false);
  });

  it("coerces a non-boolean narration flag back to the default", () => {
    expect(normalizeSettings({ masterVolume: 1, muted: false, narrateCodec: "yes" }).narrateCodec).toBe(
      true,
    );
  });

  it("survives storage being unavailable", () => {
    installBlockedStorage();
    expect(() => saveSettings({ masterVolume: 0.5, muted: false, narrateCodec: true })).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
