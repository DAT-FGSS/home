/**
 * 18-key C major kalimba (teaching layout)
 * Player view: looking down at instrument, longest tines in center.
 * Visual left→right order (index 0..17):
 *   D6 F5 A5 C5 E5 G5 B5 D5 | C5 E5 G5 B4 D5 F4 A4 C4
 * Wait — standard 17/18-key C: center is longest = C4 (or sometimes middle).
 *
 * Standard 17-key C: from left short to center long alternating:
 *   Left side (high→low toward center): D6,B5,G5,E5,C5,A4,F4,D4 then center C4?
 * Common 17-key C major (Hugh Tracey style, 17):
 *   Visual L→R: D6 B5 G5 E5 C5 A4 F4 D4 C4 E4 G4 B4 D5 F5 A5 C6 E6
 *
 * For 18-key we add one more low/high. Popular 18-key C:
 *   L→R: F3 A3 C4 E4 G4 B4 D5 F5 A5 | C5 E5 G5 B5 D6 F6 A6 C7  — that's not right either.
 *
 * We'll use a clear beginner 18-key C major layout documented as:
 * Numbered 1–18 left to right on the instrument face.
 * Center-longest pair around middle C / tonic area.
 *
 * Chosen layout (visual L→R, facing player):
 * Key#:  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18
 * Note: D6   B5   G5   E5   C5   A4   F4   D4   C4   E4   G4   B4   D5   F5   A5   C6   E6   G6
 * (Key 9 = longest C4 center-left; Key 10 = next-longest E4 center-right)
 * Alternating pattern: odd positions left of center are ascending going inward on left,
 * standard Hugh Tracey-like with added G6 for 18th.
 *
 * Jianpu degree relative to C: C=1 D=2 E=3 F=4 G=5 A=6 B=7
 */
window.KALIMBA = {
  // MIDI-ish frequencies
  NOTES: {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
  },
  // Visual order left → right (facing player)
  KEYS: [
    { id: 1,  note: "D6", jianpu: "2", octave: 2, solfa: "re" },
    { id: 2,  note: "B5", jianpu: "7", octave: 1, solfa: "ti" },
    { id: 3,  note: "G5", jianpu: "5", octave: 1, solfa: "sol" },
    { id: 4,  note: "E5", jianpu: "3", octave: 1, solfa: "mi" },
    { id: 5,  note: "C5", jianpu: "1", octave: 1, solfa: "do" },
    { id: 6,  note: "A4", jianpu: "6", octave: 0, solfa: "la" },
    { id: 7,  note: "F4", jianpu: "4", octave: 0, solfa: "fa" },
    { id: 8,  note: "D4", jianpu: "2", octave: 0, solfa: "re" },
    { id: 9,  note: "C4", jianpu: "1", octave: 0, solfa: "do" },
    { id: 10, note: "E4", jianpu: "3", octave: 0, solfa: "mi" },
    { id: 11, note: "G4", jianpu: "5", octave: 0, solfa: "sol" },
    { id: 12, note: "B4", jianpu: "7", octave: 0, solfa: "ti" },
    { id: 13, note: "D5", jianpu: "2", octave: 1, solfa: "re" },
    { id: 14, note: "F5", jianpu: "4", octave: 1, solfa: "fa" },
    { id: 15, note: "A5", jianpu: "6", octave: 1, solfa: "la" },
    { id: 16, note: "C6", jianpu: "1", octave: 2, solfa: "do" },
    { id: 17, note: "E6", jianpu: "3", octave: 2, solfa: "mi" },
    { id: 18, note: "G6", jianpu: "5", octave: 2, solfa: "sol" }
  ]
};

window.KALIMBA.byNote = {};
window.KALIMBA.KEYS.forEach(function (k) {
  window.KALIMBA.byNote[k.note] = k;
});
