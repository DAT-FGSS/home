(function () {
  var ctx = null;
  var muted = false;
  var unlocked = false;
  var unlockPromise = null;
  var masterGain = null;
  var activeSources = [];
  var pendingOnRunning = [];

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

  /** Soft audible unlock beep (~0.08) so the user hears audio works. */
  function playUnlockBeep(c) {
    try {
      var t0 = c.currentTime;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + 0.09);
    } catch (e) { /* ignore */ }
  }

  /** Near-silent buffer start — required on some iOS builds. */
  function playUnlockBuffer(c) {
    try {
      var n = Math.max(1, Math.floor(c.sampleRate * 0.02));
      var buf = c.createBuffer(1, n, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = (i < 8) ? 0.01 : 0.00001;
      var src = c.createBufferSource();
      src.buffer = buf;
      var g = c.createGain();
      g.gain.value = 0.05;
      src.connect(g);
      g.connect(c.destination);
      src.start(0);
    } catch (e) { /* ignore */ }
  }

  /** Tiny WAV data-URI via HTMLAudioElement — second unlock path for stubborn iOS. */
  function playHtmlAudioUnlock() {
    try {
      // Minimal valid WAV: 0.05s silence-ish 8-bit mono 8kHz with a soft click
      var wav =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
      var a = new Audio(wav);
      a.volume = 0.01;
      var p = a.play();
      if (p && typeof p.catch === "function") p.catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  function flushPendingOnRunning() {
    var list = pendingOnRunning.slice();
    pendingOnRunning = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { /* ignore */ }
    }
  }

  function watchRunning(c) {
    if (!c || c._kalimbaWatch) return;
    c._kalimbaWatch = true;
    var onChange = function () {
      if (c.state === "running") {
        flushPendingOnRunning();
      }
    };
    try {
      c.addEventListener("statechange", onChange);
    } catch (e) { /* ignore */ }
  }

  /**
   * Synchronously unlock AudioContext on the user-gesture call stack.
   * Creates context, resume(), starts buffer + soft beep + HTMLAudio — all sync.
   * Returns the context (may still be suspended while resume is in flight).
   */
  function unlockSync() {
    var c = getCtx();
    if (!c) return null;

    getMaster();
    watchRunning(c);

    // Always kick resume on the gesture stack (even if already "running" —
    // iOS can flip back to suspended after backgrounding).
    if (c.state === "suspended" || c.state === "interrupted") {
      try {
        var r = c.resume();
        if (r && typeof r.then === "function") {
          r.then(function () {
            flushPendingOnRunning();
          }).catch(function () { /* ignore */ });
        }
      } catch (e) { /* ignore */ }
    }

    // Critical: start sources on THIS synchronous turn (iOS Safari requirement).
    if (!unlocked) {
      playUnlockBuffer(c);
      playUnlockBeep(c);
      playHtmlAudioUnlock();
      unlocked = true;
    } else {
      // Re-prime with a near-silent buffer on every gesture if still not running
      if (c.state !== "running") {
        playUnlockBuffer(c);
      }
    }

    return c;
  }

  /**
   * Register a callback to run once when ctx reaches 'running'
   * (or immediately if already running).
   */
  function whenRunning(fn) {
    var c = getCtx();
    if (!c) {
      fn();
      return;
    }
    if (c.state === "running") {
      fn();
      return;
    }
    pendingOnRunning.push(fn);
    watchRunning(c);
    try {
      var r = c.resume();
      if (r && typeof r.then === "function") {
        r.then(function () {
          if (c.state === "running") flushPendingOnRunning();
        }).catch(function () { /* ignore */ });
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Ensure AudioContext exists and is running.
   * Resolves when ctx.state === 'running'. Prefer unlockSync() in gesture handlers.
   */
  function ensure() {
    var c = unlockSync();
    if (!c) return Promise.resolve(null);

    if (c.state === "running") {
      return Promise.resolve(c);
    }

    if (unlockPromise) return unlockPromise;

    unlockPromise = new Promise(function (resolve) {
      whenRunning(function () {
        unlockPromise = null;
        resolve(c);
      });
      // Safety timeout so callers are not stuck forever
      setTimeout(function () {
        if (unlockPromise) {
          unlockPromise = null;
          resolve(c);
        }
      }, 1500);
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
   * Safe to call synchronously right after unlockSync() on the same gesture.
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

    // Louder pluck for mobile speakers (peak ~0.8)
    var local = c.createGain();
    local.gain.setValueAtTime(0.0001, t0);
    local.gain.exponentialRampToValueAtTime(0.8, t0 + 0.008);
    local.gain.exponentialRampToValueAtTime(0.18, t0 + 0.18);
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
    hg.gain.exponentialRampToValueAtTime(0.28, t0 + 0.005);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    harm.connect(hg);
    hg.connect(dest);
    harm.start(t0);
    harm.stop(t0 + 0.4);
    trackSource(harm);
  }

  /**
   * Schedule song notes on the Web Audio clock (from fromIndex onward).
   * Uses currentTime + 0.05 so first note is slightly after unlock/resume.
   * Returns timeline for visual sync + cancel().
   */
  function scheduleSong(notes, bpm, fromIndex) {
    var c = getCtx();
    if (!c) {
      return { cancel: function () {}, startTime: 0, times: [], endTime: 0 };
    }
    getMaster();
    var beatSec = 60 / bpm;
    var t = c.currentTime + 0.05;
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
    unlockSync: unlockSync,
    ensure: ensure,
    whenRunning: whenRunning,
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
