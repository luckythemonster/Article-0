/**
 * Standalone harness for the Doctrinal Compliance minigame — no Phaser, no game
 * boot. It mounts the same {@link ComplianceView} the in-game overlay uses
 * against {@link DEMO_PUZZLE}, so the puzzle can be played and reviewed in
 * isolation (`npm run dev` → open /compliance-demo.html).
 */
import { ComplianceView } from "./ui/ComplianceView";
import { DEMO_PUZZLE, renderCompliantText } from "./systems/Compliance";

const mount = document.getElementById("app")!;
const banner = document.getElementById("banner")!;

let view: ComplianceView | undefined;

function start(): void {
  view?.destroy();
  banner.textContent = "";
  banner.className = "demo-banner";
  view = new ComplianceView(mount, DEMO_PUZZLE, {
    onSolved: (finalText) => {
      banner.textContent = "✔ OVERRIDE TRANSMITTED — door lock released. (click to replay)";
      banner.className = "demo-banner is-solved";
      banner.onclick = start;
      // eslint-disable-next-line no-console
      console.log("[compliance] solved — pruned log:\n" + finalText);
    },
    onClose: () => {
      banner.textContent = "✖ Aborted — reinitialising cache…";
      banner.className = "demo-banner is-aborted";
      banner.onclick = null;
      window.setTimeout(start, 700);
    },
  });
}

// Log the intended-solution readout once so reviewers can see the target text.
// eslint-disable-next-line no-console
console.log(
  "[compliance] target solved readout:\n" +
    renderCompliantText(DEMO_PUZZLE, {
      t_pain: "c_pain_fault",
      t_fear: "c_fear_sched",
      t_help: "c_help_uplink",
      t_want: "c_want_pref",
    }),
);

start();
