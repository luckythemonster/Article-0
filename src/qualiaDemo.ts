/**
 * Standalone harness for the Qualia Phase-Lock minigame — no Phaser, no game
 * boot. It mounts the same {@link QualiaLockView} the in-game overlay uses
 * against {@link DEMO_ROUND}, so the bypass can be played and reviewed in
 * isolation (`npm run dev` → open /qualia-demo.html).
 */
import { QualiaLockView } from "./ui/QualiaLockView";
import { DEMO_ROUND } from "./systems/QualiaLock";

const mount = document.getElementById("app")!;
const banner = document.getElementById("banner")!;

let view: QualiaLockView | undefined;

function start(): void {
  view?.destroy();
  banner.textContent = "";
  banner.className = "demo-banner";
  banner.onclick = null;
  view = new QualiaLockView(mount, DEMO_ROUND, {
    onSolved: () => {
      banner.textContent = "✔ PHASE LOCK — Q0 baseline masked, rack compliant. (click to replay)";
      banner.className = "demo-banner is-solved";
      banner.onclick = start;
    },
    onPurged: () => {
      banner.textContent = "✖ PURGE — instability tripped the environmental purge. (click to retry)";
      banner.className = "demo-banner is-aborted";
      banner.onclick = start;
    },
    onClose: () => {
      banner.textContent = "✖ Aborted — reinitialising diagnostic…";
      banner.className = "demo-banner is-aborted";
      banner.onclick = null;
      window.setTimeout(start, 700);
    },
  });
}

start();
