import { playDrumset } from "./drumset";
import { playFM } from "./fm";
import { playHarmonics } from "./harmonics";
import { playPickedString } from "./pickedString";
import { playSpectrum } from "./spectrum";
import type { VoiceInputs } from "./types";

export type { VoiceInputs } from "./types";

export function playVoice(inputs: VoiceInputs): void {
  switch (inputs.instrument.type) {
    case "FM":
      playFM(inputs);
      return;
    case "harmonics":
      playHarmonics(inputs);
      return;
    case "Picked String":
      playPickedString(inputs);
      return;
    case "spectrum":
      playSpectrum(inputs);
      return;
    case "drumset":
      playDrumset(inputs);
      return;
  }
}
