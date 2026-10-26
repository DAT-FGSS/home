(function () {
  var ctx = null;
  var muted = false;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function setMuted(m) { muted = !!m; }
  function isMuted() { return muted; }

  /** Metallic pluck: short sine + quiet square, exponential decay */
  function playNote(noteName, when) {
    if (muted) return;
    var c = ensure();
    if (!c) return;
    var freq = window.KALIMBA.NOTES[noteName];
    if (!freq) return;
    var t0 = (when != null ? when : c.currentTime);

    var master = c.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.55, t0 + 0.008);
    master.gain.exponentialRampToValueAtTime(0.12, t0 + 0.18);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    master.connect(c.destination);

    var osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(master);
    osc.start(t0);
    osc.stop(t0 + 1.65);

    var harm = c.createOscillator();
    harm.type = "triangle";
    harm.frequency.setValueAtTime(freq * 2.01, t0);
    var hg = c.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    harm.connect(hg);
    hg.connect(c.destination);
    harm.start(t0);
    harm.stop(t0 + 0.4);
  }

  window.KalimbaAudio = { ensure: ensure, playNote: playNote, setMuted: setMuted, isMuted: isMuted };
})();
