(function () {
  var KEYS = window.KALIMBA.KEYS;
  var SONGS = window.KALIMBA_SONGS;

  var state = {
    songId: SONGS[0].id,
    playing: false,
    paused: false,
    noteIndex: 0,
    sectionIndex: 0,
    bpm: 90,
    showScore: true,
    muted: false,
    schedule: null,
    rafId: null,
    visualCursor: 0,
    playGeneration: 0
  };

  function $(id) { return document.getElementById(id); }

  function tineHeightPct(id) {
    var dist = Math.min(Math.abs(id - 9), Math.abs(id - 10));
    return 96 - dist * 6.5;
  }

  function buildKalimba() {
    var root = $("tines");
    root.innerHTML = "";
    KEYS.forEach(function (k) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tine";
      btn.dataset.note = k.note;
      btn.dataset.id = String(k.id);
      btn.setAttribute("aria-label", "琴鍵 " + k.id + "　" + k.note);
      var bar = document.createElement("span");
      bar.className = "tine-bar";
      bar.style.height = tineHeightPct(k.id) + "%";
      var lab = document.createElement("span");
      lab.className = "tine-label";
      lab.innerHTML = '<span class="note">' + k.note + '</span><span class="num">' + k.id + "</span>";
      btn.appendChild(bar);
      btn.appendChild(lab);
      // Sync unlock + playNote on the SAME gesture stack (iOS Safari).
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        window.KalimbaAudio.unlockSync();
        strikeKey(k.note, true);
        // If resume was still pending, re-trigger once running.
        if (!window.KalimbaAudio.isRunning()) {
          window.KalimbaAudio.whenRunning(function () {
            window.KalimbaAudio.playNote(k.note);
          });
        }
      });
      root.appendChild(btn);
    });
  }

  function strikeKey(note, fromUser) {
    if (fromUser) {
      window.KalimbaAudio.playNote(note);
    }
    var btn = document.querySelector('.tine[data-note="' + note + '"]');
    if (!btn) return;
    btn.classList.remove("pressed");
    void btn.offsetWidth;
    btn.classList.add("pressed");
    clearTimeout(btn._pressTimer);
    btn._pressTimer = setTimeout(function () {
      btn.classList.remove("pressed");
    }, 220);
  }

  function currentSong() {
    for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === state.songId) return SONGS[i];
    return SONGS[0];
  }

  /** Split song notes into bars (sections) by song.bar beat length. */
  function getSections(song) {
    var barLen = song.bar || 4;
    var sections = [];
    var cur = [];
    var acc = 0;
    song.notes.forEach(function (ev, idx) {
      if (acc >= barLen - 0.001 && cur.length) {
        sections.push(cur);
        cur = [];
        acc = 0;
      }
      cur.push({ ev: ev, idx: idx });
      acc += ev.d;
    });
    if (cur.length) sections.push(cur);
    return sections;
  }

  function sectionCount() {
    return getSections(currentSong()).length;
  }

  function sectionForNoteIndex(noteIdx) {
    var sections = getSections(currentSong());
    for (var s = 0; s < sections.length; s++) {
      var first = sections[s][0].idx;
      var last = sections[s][sections[s].length - 1].idx;
      if (noteIdx >= first && noteIdx <= last) return s;
    }
    return 0;
  }

  function fillSongSelect() {
    var sel = $("songSelect");
    sel.innerHTML = "";
    SONGS.forEach(function (s, i) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = (i + 1) + ". " + s.title;
      sel.appendChild(o);
    });
    sel.value = state.songId;
  }

  function jianpuHtml(key) {
    if (!key) return { j: "–", hi: "", lo: "" };
    var hi = "", lo = "";
    if (key.octave === 1) hi = "●";
    if (key.octave === 2) hi = "●●";
    if (key.octave < 0) lo = "●";
    return { j: key.jianpu, hi: hi, lo: lo };
  }

  function noteCellHtml(ev) {
    if (!ev.n) {
      return '<span class="dot-high"></span><span class="jianpu">0</span><span class="dot-low"></span><span class="solfa"></span><span class="key-num">休止</span>';
    }
    var k = window.KALIMBA.byNote[ev.n];
    var jp = jianpuHtml(k);
    return (
      '<span class="dot-high">' + jp.hi + "</span>" +
      '<span class="jianpu">' + jp.j + "</span>" +
      '<span class="dot-low">' + jp.lo + "</span>" +
      '<span class="solfa">' + (k ? k.solfa : "") + "</span>" +
      '<span class="key-num">鍵' + (k ? k.id : "?") + "・" + ev.n + "</span>"
    );
  }

  function renderScore() {
    var song = currentSong();
    $("scoreTitle").textContent = song.title;
    $("scoreMeta").textContent = song.meta + "　｜　琴鍵編號見各音下方";

    var scroll = $("scoreRow");
    scroll.innerHTML = "";
    var sections = getSections(song);

    sections.forEach(function (sec) {
      var barEl = document.createElement("div");
      barEl.className = "score-bar";
      sec.forEach(function (item) {
        var noteEl = document.createElement("div");
        noteEl.className = "score-note" + (item.ev.n ? "" : " rest");
        noteEl.dataset.idx = String(item.idx);
        noteEl.innerHTML = noteCellHtml(item.ev);
        barEl.appendChild(noteEl);
      });
      scroll.appendChild(barEl);
    });
    highlightScore(state.playing || state.paused ? state.noteIndex : -1);
    renderSectionOverlay();
  }

  function highlightScore(idx) {
    var nodes = document.querySelectorAll(".score-note");
    nodes.forEach(function (el) {
      var i = parseInt(el.dataset.idx, 10);
      el.classList.toggle("current", i === idx);
      el.classList.toggle("played", idx >= 0 && i < idx);
    });
    var cur = document.querySelector('.score-note[data-idx="' + idx + '"]');
    if (cur && state.showScore) {
      cur.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    var oNodes = document.querySelectorAll(".section-note");
    oNodes.forEach(function (el) {
      var i = parseInt(el.dataset.idx, 10);
      el.classList.toggle("current", i === idx);
      el.classList.toggle("played", idx >= 0 && i < idx);
    });
  }

  function renderSectionOverlay() {
    var song = currentSong();
    var sections = getSections(song);
    var total = sections.length || 1;
    if (state.sectionIndex < 0) state.sectionIndex = 0;
    if (state.sectionIndex >= total) state.sectionIndex = total - 1;

    var label = $("sectionLabel");
    if (label) label.textContent = "第 " + (state.sectionIndex + 1) + "／" + total + " 節";

    var row = $("sectionRow");
    if (!row) return;
    row.innerHTML = "";
    var sec = sections[state.sectionIndex] || [];
    sec.forEach(function (item) {
      var noteEl = document.createElement("div");
      noteEl.className = "section-note score-note" + (item.ev.n ? "" : " rest");
      noteEl.dataset.idx = String(item.idx);
      noteEl.innerHTML = noteCellHtml(item.ev);
      row.appendChild(noteEl);
    });

    var hi = state.playing || state.paused ? state.noteIndex : -1;
    row.querySelectorAll(".section-note").forEach(function (el) {
      var i = parseInt(el.dataset.idx, 10);
      el.classList.toggle("current", i === hi);
      el.classList.toggle("played", hi >= 0 && i < hi);
    });

    var prev = $("btnSecPrev");
    var next = $("btnSecNext");
    if (prev) prev.disabled = state.sectionIndex <= 0;
    if (next) next.disabled = state.sectionIndex >= total - 1;
  }

  function setSection(idx) {
    var total = sectionCount();
    state.sectionIndex = Math.max(0, Math.min(total - 1, idx));
    renderSectionOverlay();
  }

  function cancelVisualLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function stopPlayback(resetIndex) {
    state.playGeneration += 1;
    state.playing = false;
    state.paused = false;
    cancelVisualLoop();
    if (state.schedule) {
      try { state.schedule.cancel(); } catch (e) { /* ignore */ }
      state.schedule = null;
    }
    window.KalimbaAudio.stopAll();
    if (resetIndex) {
      state.noteIndex = 0;
      state.visualCursor = 0;
      state.sectionIndex = 0;
      highlightScore(-1);
      renderSectionOverlay();
    }
    updateTransportUI();
  }

  function runVisualLoop() {
    if (!state.playing || state.paused || !state.schedule) return;
    var now = window.KalimbaAudio.currentTime();
    var times = state.schedule.times;
    var song = currentSong();

    while (
      state.visualCursor < times.length &&
      now >= times[state.visualCursor].time - 0.02
    ) {
      var item = times[state.visualCursor];
      state.noteIndex = item.index;
      var sec = sectionForNoteIndex(item.index);
      if (sec !== state.sectionIndex) {
        state.sectionIndex = sec;
        renderSectionOverlay();
      }
      highlightScore(item.index);
      if (item.note) strikeKey(item.note, false);
      $("statusLine").innerHTML =
        "狀態：<strong>播放中</strong>　《" + song.title + "》　第 " +
        (item.index + 1) + "／" + song.notes.length + " 音　｜　第 " +
        (state.sectionIndex + 1) + "／" + sectionCount() + " 節";
      state.visualCursor += 1;
    }

    if (state.visualCursor >= times.length) {
      if (now >= state.schedule.endTime - 0.05) {
        stopPlayback(true);
        $("statusLine").innerHTML = "狀態：<strong>播放完畢</strong>　《" + song.title + "》";
        return;
      }
    }

    state.rafId = requestAnimationFrame(runVisualLoop);
  }

  function beginScheduleFromCurrent() {
    var song = currentSong();
    if (state.noteIndex >= song.notes.length) {
      state.noteIndex = 0;
      state.sectionIndex = 0;
    }
    state.sectionIndex = sectionForNoteIndex(state.noteIndex);
    renderSectionOverlay();

    state.playing = true;
    state.paused = false;
    updateTransportUI();

    if (state.schedule) {
      try { state.schedule.cancel(); } catch (e) { /* ignore */ }
    }
    window.KalimbaAudio.stopAll();

    state.schedule = window.KalimbaAudio.scheduleSong(
      song.notes,
      state.bpm,
      state.noteIndex
    );
    state.visualCursor = 0;
    $("statusLine").innerHTML =
      "狀態：<strong>播放中</strong>　《" + song.title + "》";
    cancelVisualLoop();
    state.rafId = requestAnimationFrame(runVisualLoop);
  }

  function startPlay() {
    // Gesture stack: unlock sync, then schedule immediately (not only in .then).
    window.KalimbaAudio.unlockSync();
    var gen = ++state.playGeneration;

    beginScheduleFromCurrent();

    // If context was not running yet, reschedule once it is (iOS resume race).
    if (!window.KalimbaAudio.isRunning()) {
      window.KalimbaAudio.whenRunning(function () {
        if (gen !== state.playGeneration) return;
        if (!state.playing || state.paused) return;
        beginScheduleFromCurrent();
      });
    }
  }

  function pausePlay() {
    if (!state.playing) return;
    state.playGeneration += 1;
    state.paused = true;
    state.playing = false;
    cancelVisualLoop();
    if (state.schedule && state.visualCursor < state.schedule.times.length) {
      state.noteIndex = state.schedule.times[state.visualCursor].index;
    } else if (state.schedule && state.visualCursor >= state.schedule.times.length) {
      state.noteIndex = currentSong().notes.length;
    }
    if (state.schedule) {
      try { state.schedule.cancel(); } catch (e) { /* ignore */ }
      state.schedule = null;
    }
    window.KalimbaAudio.stopAll();
    $("statusLine").innerHTML = "狀態：<strong>已暫停</strong>　《" + currentSong().title + "》";
    updateTransportUI();
  }

  function updateTransportUI() {
    var playDis = state.playing && !state.paused;
    var pauseDis = !state.playing || state.paused;
    var stopDis = !state.playing && !state.paused && state.noteIndex === 0;
    $("btnPlay").disabled = playDis;
    $("btnPause").disabled = pauseDis;
    $("btnStop").disabled = stopDis;
    var playNear = $("btnPlayNear");
    var pauseNear = $("btnPauseNear");
    var stopNear = $("btnStopNear");
    if (playNear) playNear.disabled = playDis;
    if (pauseNear) pauseNear.disabled = pauseDis;
    if (stopNear) stopNear.disabled = stopDis;
    var navLock = state.playing && !state.paused;
    var prev = $("btnSecPrev");
    var next = $("btnSecNext");
    var total = sectionCount();
    if (prev) prev.disabled = navLock || state.sectionIndex <= 0;
    if (next) next.disabled = navLock || state.sectionIndex >= total - 1;
  }

  function setShowScore(on) {
    state.showScore = on;
    $("scorePanel").classList.toggle("visible", on);
    $("btnScore").classList.toggle("on", on);
    $("btnScore").textContent = on ? "隱藏曲譜" : "顯示曲譜";
    $("btnScore").setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setMuted(on) {
    state.muted = on;
    window.KalimbaAudio.setMuted(on);
    $("btnMute").classList.toggle("on", on);
    $("btnMute").textContent = on ? "取消靜音" : "靜音";
    $("btnMute").setAttribute("aria-pressed", on ? "true" : "false");
  }

  function buildLegend() {
    var tb = $("mapBody");
    tb.innerHTML = "";
    KEYS.forEach(function (k) {
      var tr = document.createElement("tr");
      var dots = k.octave === 1 ? "（高八度・上加一點）" : k.octave === 2 ? "（高兩八度・上加兩點）" : "";
      tr.innerHTML =
        "<td>" + k.id + "</td><td>" + k.note + "</td><td>" +
        k.jianpu + dots + "</td><td>" + k.solfa + "</td>";
      tb.appendChild(tr);
    });
  }

  function bindUnlockGestures() {
    var unlock = function () {
      window.KalimbaAudio.unlockSync();
    };
    // Capture phase so unlock runs before other handlers lose the gesture.
    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("touchstart", unlock, { capture: true, passive: true });
    document.addEventListener("click", unlock, { capture: true, passive: true });
  }

  function bind() {
    $("songSelect").addEventListener("change", function () {
      stopPlayback(true);
      state.songId = this.value;
      state.sectionIndex = 0;
      renderScore();
      $("statusLine").innerHTML = "狀態：<strong>已選曲</strong>　《" + currentSong().title + "》　可按播放或點琴鍵練習";
    });
    function onStopClick() {
      stopPlayback(true);
      $("statusLine").innerHTML = "狀態：<strong>已停止</strong>";
    }
    $("btnPlay").addEventListener("click", function () {
      startPlay();
    });
    $("btnPause").addEventListener("click", pausePlay);
    $("btnStop").addEventListener("click", onStopClick);
    if ($("btnPlayNear")) {
      $("btnPlayNear").addEventListener("click", function () {
        startPlay();
      });
    }
    if ($("btnPauseNear")) {
      $("btnPauseNear").addEventListener("click", pausePlay);
    }
    if ($("btnStopNear")) {
      $("btnStopNear").addEventListener("click", onStopClick);
    }
    $("btnMute").addEventListener("click", function () {
      setMuted(!state.muted);
    });
    $("btnScore").addEventListener("click", function () {
      setShowScore(!state.showScore);
    });
    $("tempo").addEventListener("input", function () {
      state.bpm = parseInt(this.value, 10);
      $("tempoVal").textContent = String(state.bpm);
      if (state.playing && !state.paused) {
        if (state.schedule && state.visualCursor < state.schedule.times.length) {
          state.noteIndex = state.schedule.times[state.visualCursor].index;
        }
        stopPlayback(false);
        state.paused = false;
        startPlay();
      }
    });
    $("btnSecPrev").addEventListener("click", function () {
      if (state.playing) return;
      setSection(state.sectionIndex - 1);
    });
    $("btnSecNext").addEventListener("click", function () {
      if (state.playing) return;
      setSection(state.sectionIndex + 1);
    });
  }

  function init() {
    buildKalimba();
    fillSongSelect();
    buildLegend();
    bindUnlockGestures();
    bind();
    setShowScore(true);
    setMuted(false);
    state.sectionIndex = 0;
    renderScore();
    updateTransportUI();
    $("tempoVal").textContent = String(state.bpm);
    $("statusLine").innerHTML = "狀態：<strong>就緒</strong>　點擊琴鍵練習，或選曲後按「播放」";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
