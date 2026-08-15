import { createFrame, type Frame, type FrameSettings } from "@arwes/frames";
import { UI } from "./hudTheme";

/**
 * The overlay panel border, in one place.
 *
 * A hand-specified Arwes frame: a filled background rect and a hairline border,
 * hardcoded to the terminal palette. The half-pixel offsets are what keep the
 * 1px stroke on the pixel grid instead of straddling two rows and going grey.
 *
 * The colours come from `hudTheme` rather than `theme.css` because this paints
 * into an SVG built in script, where the custom properties aren't resolved. They
 * used to be hand-copied literals kept "in step by hand", which is the drift
 * `hudTheme` exists to stop — the TS constant resolves fine here even though a
 * `var()` would not.
 */
export function terminalFrameSettings(): FrameSettings {
  return {
    elements: [
      {
        type: "rect",
        name: "bg",
        x: 0,
        y: 0,
        width: "100%",
        height: "100%",
        style: { fill: UI.bgPanel, fillOpacity: 0.97, stroke: "none" },
      },
      {
        type: "rect",
        name: "border",
        x: 0.5,
        y: 0.5,
        width: "100% - 1",
        height: "100% - 1",
        style: { fill: "none", stroke: UI.border, strokeWidth: 1 },
      },
    ],
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds the decorative frame SVG for a panel and returns it with its Arwes
 * handle. Marked `aria-hidden` — the panel's text carries the accessible
 * content, and a screen reader announcing a border is pure noise.
 */
export function createPanelFrame(className: string): { svg: SVGSVGElement; mount: () => Frame } {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  return { svg, mount: () => createFrame(svg, terminalFrameSettings()) };
}
