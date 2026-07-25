/** BeepBox pitch integers follow standard MIDI numbering (pitch 69 = A4 = 440Hz). */
export function pitchToFrequency(pitch: number, bendSemitones = 0): number {
  return 440 * 2 ** ((pitch + bendSemitones - 69) / 12);
}
