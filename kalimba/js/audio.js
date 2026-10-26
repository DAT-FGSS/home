(function () {
  var ctx = null;
  var muted = false;
  var unlocked = false;
  var unlockPromise = null;
  var masterGain = null;
  var activeSources = [];

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  function getMaster() {
    var c = getCtx();
    if (!c) return null;
    if (!masterGain) {
      masterGain = c.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(c.destination);
    }
    return masterGain;
  }

  function playUnlockBuffer(c) {
    try {
      var n = Math.max(1, Math.floor(c.sampleRate * 0.02));
      var buf = c.createBuffer(1, n, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = 0.00001;
      var src = c.createBufferSource();
      src.buffer = buf;
      var g = c.createGain();
      g.gain.value = 0.001;
      src.connect(g);
      g.connect(c.destination);
      src.start(0);
    } catch (e) { /* ignore */ }
  }

  /**
   * Ensure AudioContext exists and is running.
   * Resolves when ctx.state === 'running'. Call from a user gesture.
   */
  function ensure() {
    var c = getCtx();
    if (!c) return Promise.resolve(null);

    if (c.state === "running" && unlocked) {
      getMaster();
      return Promise.resolve(c);
    }

    if (unlockPromise) return unlockPromise;

    unlockPromise = Promise.resolve()
      .then(function () {
        if (c.state === "suspended" || c.state === "interrupted") {
          return c.resume();
        }
      })
      .then(function () {
        if (!unlocked) {
          playUnlockBuffer(c);
          try {
            var osc = c.createOscillator();
            var g = c.createGain();
            g.gain.value = 0.0001;
            osc.connect(g);
            g.connect(c.destination);
            osc.start();
            osc.stop(c.currentTime + 0.03);
          } catch (e2) { /* ignore */ }
          unlocked = true;
        }
        getMaster();
        if (c.state !== "running") return c.resume();
      })
      .then(function () {
        return c;
      })
      .catch(function () {
        unlocked = false;
        return c;
      })
      .then(function (result) {
        unlockPromise = null;
        return result;
      });

    return unlockPromise;
  }

  function setMuted(m) {
    muted = !!m;
    var mg = getMaster();
    if (mg) {
      var c = getCtx();
      var t = c ? c.currentTime : 0;
      mg.gain.cancelScheduledValues(t);
      mg.gain.setValueAtTime(muted ? 0 : 1, t);
    }
  }
  function isMuted() { return muted; }
  function currentTime() {
    var c = getCtx();
    return c ? c.currentTime : 0;
  }
  function isRunning() {
    return !!(ctx && ctx.state === "running");
  }

  function trackSource(node) {
    activeSources.push(node);
    node.onended = function () {
      var i = activeSources.indexOf(node);
      if (i >= 0) activeSources.splice(i, 1);
    };
  }

  /** Stop all scheduled / playing oscillators (for pause / stop). */
  function stopAll() {
    var c = getCtx();
    var now = c ? c.currentTime : 0;
    activeSources.slice().forEach(function (node) {
      try { node.stop(now); } catch (e) { /* already stopped */ }
    });
    activeSources = [];
  }

  /**
   * Metallic pluck scheduled at absolute AudioContext time `when`.
   * @param {string} noteName
   * @param {number} [when]
   */
  function playNote(noteName, when) {
    var c = getCtx();
    var dest = getMaster();
    if (!c || !dest) return;
    var freq = window.KALIMBA.NOTES[noteName];
    if (!freq) return;
    var t0 = (when != null ? when : c.currentTime);

    var local = c.createGain();
    local.gain.setValueAtTime(0.0001, t0);
    local.gain.exponentialRampToValueAtTime(0.55, t0 + 0.008);
    local.gain.exponentialRampToValueAtTime(0.12, t0 + 0.18);
    local.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    local.connect(dest);

    var osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(local);
    osc.start(t0);
    osc.stop(t0 + 1.65);
    trackSource(osc);

    var harm = c.createOscillator();
    harm.type = "triangle";
    harm.frequency.setValueAtTime(freq * 2.01, t0);
    var hg = c.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    harm.connect(hg);
    hg.connect(dest);
    harm.start(t0);
    harm.stop(t0 + 0.4);
    trackSource(harm);
  }

  /**
   * Schedule song notes on the Web Audio clock (from fromIndex onward).
   * Returns timeline for visual sync + cancel().
   */
  function scheduleSong(notes, bpm, fromIndex) {
    var c = getCtx();
    if (!c) {
      return { cancel: function () {}, startTime: 0, times: [], endTime: 0 };
    }
    var beatSec = 60 / bpm;
    var t = c.currentTime + 0.08;
    var startTime = t;
    var times = [];
    var i0 = fromIndex || 0;

    for (var i = i0; i < notes.length; i++) {
      times.push({ index: i, time: t, note: notes[i].n });
      if (notes[i].n) playNote(notes[i].n, t);
      t += notes[i].d * beatSec;
    }

    return {
      cancel: stopAll,
      startTime: startTime,
      times: times,
      endTime: t
    };
  }

  window.KalimbaAudio = {
    ensure: ensure,
    playNote: playNote,
    setMuted: setMuted,
    isMuted: isMuted,
    currentTime: currentTime,
    isRunning: isRunning,
    scheduleSong: scheduleSong,
    stopAll: stopAll,
    getCtx: getCtx
  };
})();
