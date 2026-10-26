(function () {
  var KEYS = window.KALIMBA.KEYS;
  var SONGS = window.KALIMBA_SONGS;

  var state = {
    songId: SONGS[0].id,
    playing: false,
    paused: false,
    noteIndex: 0,
    timer: null,
    bpm: 90,
    showScore: true,
    muted: false
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function tineHeightPct(id) {
    // Longest at center (9,10), shorter outward
    var dist = Math.min(Math.abs(id - 9), Math.abs(id - 10));
    // id 9,10 → dist 0 → 96%; edge dist ~8 → 42%
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
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        strikeKey(k.note, true);
      });
      root.appendChild(btn);
    });
  }

  function strikeKey(note, fromUser) {
    if (fromUser) window.KalimbaAudio.ensure();
    window.KalimbaAudio.playNote(note);
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

  function renderScore() {
    var song = currentSong();
    $("scoreTitle").textContent = song.title;
    $("scoreMeta").textContent = song.meta + "　｜　琴鍵編號見各音下方";

    var scroll = $("scoreRow");
    scroll.innerHTML = "";
    var barLen = song.bar || 4;
    var acc = 0;
    var barEl = document.createElement("div");
    barEl.className = "score-bar";

    song.notes.forEach(function (ev, idx) {
      if (acc >= barLen - 0.001) {
        scroll.appendChild(barEl);
        barEl = document.createElement("div");
        barEl.className = "score-bar";
        acc = 0;
      }
      var noteEl = document.createElement("div");
      noteEl.className = "score-note" + (ev.n ? "" : " rest");
      noteEl.dataset.idx = String(idx);
      if (!ev.n) {
        noteEl.innerHTML = '<span class="dot-high"></span><span class="jianpu">0</span><span class="dot-low"></span><span class="key-num">休止</span>';
      } else {
        var k = window.KALIMBA.byNote[ev.n];
        var jp = jianpuHtml(k);
        noteEl.innerHTML =
          '<span class="dot-high">' + jp.hi + "</span>" +
          '<span class="jianpu">' + jp.j + "</span>" +
          '<span class="dot-low">' + jp.lo + "</span>" +
          '<span class="solfa">' + (k ? k.solfa : "") + "</span>" +
          '<span class="key-num">鍵' + (k ? k.id : "?") + "・" + ev.n + "</span>";
      }
      barEl.appendChild(noteEl);
      acc += ev.d;
    });
    if (barEl.childNodes.length) scroll.appendChild(barEl);
    highlightScore(-1);
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
  }

  function beatMs() {
    return 60000 / state.bpm;
  }

  function stopPlayback(resetIndex) {
    state.playing = false;
    state.paused = false;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (resetIndex) {
      state.noteIndex = 0;
      highlightScore(-1);
    }
    updateTransportUI();
  }

  function playStep() {
    if (!state.playing || state.paused) return;
    var song = currentSong();
    if (state.noteIndex >= song.notes.length) {
      stopPlayback(true);
      $("statusLine").innerHTML = "狀態：<strong>播放完畢</strong>　《" + song.title + "》";
      return;
    }
    var ev = song.notes[state.noteIndex];
    highlightScore(state.noteIndex);
    if (ev.n) strikeKey(ev.n, false);
    $("statusLine").innerHTML =
      "狀態：<strong>播放中</strong>　《" + song.title + "》　第 " +
      (state.noteIndex + 1) + "／" + song.notes.length + " 音";
    var wait = ev.d * beatMs();
    state.noteIndex += 1;
    state.timer = setTimeout(playStep, wait);
  }

  function startPlay() {
    window.KalimbaAudio.ensure();
    var song = currentSong();
    if (state.noteIndex >= song.notes.length) state.noteIndex = 0;
    state.playing = true;
    state.paused = false;
    updateTransportUI();
    playStep();
  }

  function pausePlay() {
    if (!state.playing) return;
    state.paused = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    $("statusLine").innerHTML = "狀態：<strong>已暫停</strong>　《" + currentSong().title + "》";
    updateTransportUI();
  }

  function updateTransportUI() {
    $("btnPlay").disabled = state.playing && !state.paused;
    $("btnPause").disabled = !state.playing || state.paused;
    $("btnStop").disabled = !state.playing && state.noteIndex === 0;
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

  function bind() {
    $("songSelect").addEventListener("change", function () {
      stopPlayback(true);
      state.songId = this.value;
      renderScore();
      $("statusLine").innerHTML = "狀態：<strong>已選曲</strong>　《" + currentSong().title + "》　可按播放或點琴鍵練習";
    });
    $("btnPlay").addEventListener("click", function () {
      if (state.paused) {
        state.paused = false;
        state.playing = true;
        updateTransportUI();
        playStep();
      } else {
        startPlay();
      }
    });
    $("btnPause").addEventListener("click", pausePlay);
    $("btnStop").addEventListener("click", function () {
      stopPlayback(true);
      $("statusLine").innerHTML = "狀態：<strong>已停止</strong>";
    });
    $("btnMute").addEventListener("click", function () {
      setMuted(!state.muted);
    });
    $("btnScore").addEventListener("click", function () {
      setShowScore(!state.showScore);
    });
    $("tempo").addEventListener("input", function () {
      state.bpm = parseInt(this.value, 10);
      $("tempoVal").textContent = String(state.bpm);
    });
  }

  function init() {
    els = {};
    buildKalimba();
    fillSongSelect();
    buildLegend();
    bind();
    setShowScore(true);
    setMuted(false);
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
