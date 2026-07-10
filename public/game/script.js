/* Wordle-style game. Vanilla JS, no dependencies. */
(function () {
  "use strict";

  const WORD_LENGTH = 5;
  const MAX_GUESSES = 6;
  const STORAGE_KEY = "wordle.v1";
  const STATS_KEY = "wordle.stats.v1";
  const SETTINGS_KEY = "wordle.settings.v1";

  // ---------- State ----------
  const defaultSettings = {
    hardMode: false,
    highContrast: false,
    reduceMotion: false,
    sound: false,
    keyboardHints: true,
    autoFocus: true,
  };
  const defaultStats = {
    played: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0],
    hintUsed: 0,
  };

  let settings = loadJSON(SETTINGS_KEY, defaultSettings);
  let stats = loadJSON(STATS_KEY, defaultStats);
  let mode = "daily"; // 'daily' | 'random'
  let game = null; // current game state

  // ---------- Helpers ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...fallback };
      const parsed = JSON.parse(raw);
      return { ...fallback, ...parsed };
    } catch {
      return { ...fallback };
    }
  }
  function saveJSON(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }
  function todayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayNumber() {
    const start = new Date(2024, 0, 1);
    const now = new Date();
    return Math.floor((now - start) / 86400000);
  }
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function dailyWord() {
    const idx = hash("wordle-" + todayStamp()) % ANSWER_WORDS.length;
    return ANSWER_WORDS[idx];
  }
  function randomWord() {
    return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
  }
  function isValidGuess(word) {
    return VALID_WORDS.includes(word);
  }

  // ---------- Game init ----------
  function newGame(kind) {
    mode = kind;
    const answer = kind === "daily" ? dailyWord() : randomWord();
    game = {
      mode: kind,
      day: kind === "daily" ? todayStamp() : null,
      answer,
      guesses: [],
      current: "",
      status: "playing",
      hintsUsed: [], // labels of hints used
      hintTainted: false,
    };
    saveGame();
    renderAll();
  }
  function saveGame() {
    saveJSON(STORAGE_KEY, game);
  }
  function loadGame() {
    const g = loadJSON(STORAGE_KEY, null);
    if (!g || !g.answer) {
      newGame("daily");
      return;
    }
    // if it was daily but a new day, start fresh daily
    if (g.mode === "daily" && g.day !== todayStamp()) {
      newGame("daily");
      return;
    }
    game = g;
    mode = g.mode;
    renderAll();
  }

  // ---------- Rendering ----------
  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const modeIndicatorEl = document.getElementById("modeIndicator");

  function sizeBoard() {
    const gameEl = document.querySelector(".game");
    const boardEl = document.getElementById("board");
    const keyboardEl = document.getElementById("keyboard");
    if (!gameEl || !boardEl || !keyboardEl) return;
  
    const gameStyles = getComputedStyle(gameEl);
    const gamePaddingV =
      parseFloat(gameStyles.paddingTop) + parseFloat(gameStyles.paddingBottom);
    const gameGap = parseFloat(gameStyles.gap) || 0;
  
    const availableHeight =
      gameEl.clientHeight -
      gamePaddingV -
      modeIndicatorEl.offsetHeight -
      keyboardEl.offsetHeight -
      gameGap * 2; // gap above and below the board
  
    const availableWidth = gameEl.clientWidth;
  
    const rows = 6, cols = 5, tileGap = 5, boardPadding = 16; // 8px * 2
  
    const byHeight = (availableHeight - tileGap * (rows - 1) - boardPadding) / rows;
    const byWidth = (availableWidth - tileGap * (cols - 1) - boardPadding) / cols;
  
    const tileSize = Math.max(38, Math.min(byHeight, byWidth, 62));
    document.documentElement.style.setProperty("--tile-size", `${tileSize}px`);
  }

  function renderAll() {
    renderBoard();
    renderKeyboard();
    updateModeIndicator();
    applySettings();
  }
  function updateModeIndicator() {
    modeIndicatorEl.textContent = mode === "daily" ? `Daily #${dayNumber()}` : "Random";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.row = r;
      row.setAttribute("role", "row");
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.col = c;
        tile.setAttribute("role", "gridcell");
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
    // Render existing guesses (evaluated)
    game.guesses.forEach((guess, i) => paintRow(i, guess, evaluate(guess, game.answer), true));
    // Render current input
    if (game.status === "playing") {
      const row = boardEl.children[game.guesses.length];
      if (row) {
        for (let i = 0; i < WORD_LENGTH; i++) {
          const t = row.children[i];
          const ch = game.current[i];
          if (ch) {
            t.textContent = ch;
            t.classList.add("filled");
          }
        }
      }
    }
  }

  const KEYS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
  ];
  function renderKeyboard() {
    keyboardEl.innerHTML = "";
    const state = keyboardState();
    KEYS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "krow";
      row.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key" + (k === "ENTER" || k === "BACK" ? " wide" : "");
        btn.type = "button";
        btn.setAttribute("aria-label", k === "BACK" ? "Backspace" : k);
        if (k === "BACK") {
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M22 3H7c-.7 0-1.3.4-1.7.9L0 12l5.3 8.1c.4.5 1 .9 1.7.9h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.6L17.6 17 14 13.4 10.4 17 9 15.6 12.6 12 9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12 19 15.6z"/></svg>';
        } else {
          btn.textContent = k;
        }
        btn.dataset.key = k;
        if (settings.keyboardHints && state[k]) btn.classList.add(state[k]);
        btn.addEventListener("click", () => handleKey(k));
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  function keyboardState() {
    // Compute best-known state per letter.
    const rank = { correct: 3, present: 2, absent: 1 };
    const state = {};
    game.guesses.forEach((g) => {
      const ev = evaluate(g, game.answer);
      for (let i = 0; i < WORD_LENGTH; i++) {
        const c = g[i],
          s = ev[i];
        if (!state[c] || rank[s] > rank[state[c]]) state[c] = s;
      }
    });
    return state;
  }

  // ---------- Evaluation ----------
  function evaluate(guess, answer) {
    const res = Array(WORD_LENGTH).fill("absent");
    const answerArr = answer.split("");
    const used = Array(WORD_LENGTH).fill(false);
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i] === answerArr[i]) {
        res[i] = "correct";
        used[i] = true;
      }
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (res[i] === "correct") continue;
      for (let j = 0; j < WORD_LENGTH; j++) {
        if (!used[j] && guess[i] === answerArr[j]) {
          res[i] = "present";
          used[j] = true;
          break;
        }
      }
    }
    return res;
  }

  function paintRow(rowIndex, guess, evaluation, instant) {
    const row = boardEl.children[rowIndex];
    if (!row) return;
    for (let i = 0; i < WORD_LENGTH; i++) {
      const tile = row.children[i];
      tile.textContent = guess[i];
      tile.classList.add("filled");
      if (instant || settings.reduceMotion) {
        tile.classList.add(evaluation[i]);
      }
    }
  }

  async function animateReveal(rowIndex, evaluation) {
    const row = boardEl.children[rowIndex];
    const delayPer = settings.reduceMotion ? 0 : 300;
    for (let i = 0; i < WORD_LENGTH; i++) {
      const tile = row.children[i];
      await new Promise((r) => setTimeout(r, delayPer));
      if (!settings.reduceMotion) {
        tile.classList.add("flip");
        setTimeout(() => tile.classList.add(evaluation[i]), 250);
      } else {
        tile.classList.add(evaluation[i]);
      }
    }
    await new Promise((r) => setTimeout(r, settings.reduceMotion ? 0 : 400));
  }

  // ---------- Input ----------
  function handleKey(key) {
    if (game.status !== "playing") return;
    if (key === "ENTER") return submitGuess();
    if (key === "BACK" || key === "BACKSPACE") return backspace();
    if (/^[A-Z]$/.test(key)) return addLetter(key);
  }
  function addLetter(ch) {
    if (game.current.length >= WORD_LENGTH) return;
    game.current += ch;
    saveGame();
    renderBoard();
  }
  function backspace() {
    if (game.current.length === 0) return;
    game.current = game.current.slice(0, -1);
    saveGame();
    renderBoard();
  }
  async function submitGuess() {
    const guess = game.current;
    if (guess.length !== WORD_LENGTH) return shakeRow("Not enough letters");
    if (!isValidGuess(guess)) return shakeRow("Not in word list");
    if (settings.hardMode) {
      const err = hardModeViolation(guess);
      if (err) return shakeRow(err);
    }
    const rowIndex = game.guesses.length;
    // paint letters immediately, then flip
    paintRow(rowIndex, guess, [], false);
    const evaluation = evaluate(guess, game.answer);
    await animateReveal(rowIndex, evaluation);
    game.guesses.push(guess);
    game.current = "";
    renderKeyboard();
    if (guess === game.answer) {
      game.status = "won";
      recordResult(true);
      celebrate(game.guesses.length);
      openEndGameModal(true);
    } else if (game.guesses.length >= MAX_GUESSES) {
      game.status = "lost";
      recordResult(false);
      shakeCurrentRow();
      openEndGameModal(false);
    }
    saveGame();
  }
  function hardModeViolation(guess) {
    // Every green must be used in position; every yellow must appear somewhere.
    for (const past of game.guesses) {
      const ev = evaluate(past, game.answer);
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (ev[i] === "correct" && guess[i] !== past[i]) {
          return `${ordinal(i + 1)} letter must be ${past[i]}`;
        }
      }
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (ev[i] === "present" && !guess.includes(past[i])) {
          return `Guess must contain ${past[i]}`;
        }
      }
    }
    return null;
  }
  function ordinal(n) {
    return ["1st", "2nd", "3rd", "4th", "5th"][n - 1] || `${n}th`;
  }

  function shakeRow(msg) {
    const rowIndex = game.guesses.length;
    const row = boardEl.children[rowIndex];
    if (row) {
      row.classList.remove("shake");
      void row.offsetWidth;
      row.classList.add("shake");
    }
    if (msg) toast(msg);
    if (navigator.vibrate) navigator.vibrate(60);
  }
  function shakeCurrentRow() {
    toast(game.answer);
    const row = boardEl.children[game.guesses.length - 1];
    row && row.classList.add("shake");
  }

  // ---------- Stats ----------
  const PRAISE = ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"];
  function celebrate(guessCount) {
    toast(PRAISE[guessCount - 1] || "Nice");
    const row = boardEl.children[guessCount - 1];
    if (row && !settings.reduceMotion) {
      [...row.children].forEach((t, i) => {
        setTimeout(() => t.classList.add("bounce"), i * 100);
      });
      confetti();
    }
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  }
  function recordResult(win) {
    stats.played += 1;
    if (win) {
      stats.wins += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      stats.distribution[game.guesses.length - 1] += 1;
    } else {
      stats.losses += 1;
      stats.currentStreak = 0;
    }
    if (game.hintTainted) stats.hintUsed += 1;
    saveJSON(STATS_KEY, stats);
  }

  // ---------- Modals ----------
  const modalRoot = document.getElementById("modalRoot");
  function openModal(node) {
    modalRoot.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.addEventListener("click", closeModal);
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const close = document.createElement("button");
    close.className = "close";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = "&times;";
    close.addEventListener("click", closeModal);
    modal.appendChild(close);
    modal.appendChild(node);
    modalRoot.appendChild(backdrop);
    modalRoot.appendChild(modal);
    modalRoot.classList.add("open");
    modalRoot.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modalRoot.classList.remove("open");
    modalRoot.setAttribute("aria-hidden", "true");
    modalRoot.innerHTML = "";
  }

  function openStatsModal() {
    const wrap = document.createElement("div");
    const total = stats.played;
    const winPct = total ? Math.round((stats.wins / total) * 100) : 0;
    const totalWins = stats.distribution.reduce((a, b) => a + b, 0);
    const avg = totalWins
      ? (stats.distribution.reduce((a, b, i) => a + b * (i + 1), 0) / totalWins).toFixed(2)
      : "0";
    const maxDist = Math.max(1, ...stats.distribution);
    const lastRow = game.status === "won" ? game.guesses.length : -1;
    wrap.innerHTML = `
      <h2>Statistics</h2>
      <div class="stats-grid">
        <div class="stat"><div class="num">${stats.played}</div><div class="lbl">Played</div></div>
        <div class="stat"><div class="num">${winPct}</div><div class="lbl">Win %</div></div>
        <div class="stat"><div class="num">${stats.currentStreak}</div><div class="lbl">Streak</div></div>
        <div class="stat"><div class="num">${stats.bestStreak}</div><div class="lbl">Best</div></div>
      </div>
      <div style="text-align:center;font-size:12px;color:var(--muted)">Avg guesses ${avg} · Hints used ${stats.hintUsed}</div>
      <h3 style="text-align:center;margin:16px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase">Guess distribution</h3>
      <div class="dist">
        ${stats.distribution
          .map(
            (n, i) => `
          <div class="dist-row"><div class="idx">${i + 1}</div>
          <div class="bar ${i === lastRow ? "hi" : ""}" style="width:${Math.max(7, (n / maxDist) * 100)}%">${n}</div></div>
        `,
          )
          .join("")}
      </div>
      <div class="actions">
        ${game.status !== "playing" ? `<button class="primary-btn" id="shareBtn">Share</button>` : ""}
        <button class="primary-btn secondary" id="newRandomBtn">New Random</button>
      </div>`;
    openModal(wrap);
    const shareBtn = wrap.querySelector("#shareBtn");
    shareBtn && shareBtn.addEventListener("click", share);
    wrap.querySelector("#newRandomBtn").addEventListener("click", () => {
      closeModal();
      newGame("random");
    });
  }

  function openEndGameModal() {
    setTimeout(openStatsModal, 1200);
  }

  function openSettingsModal() {
    const rows = [
      {
        key: "hardMode",
        name: "Hard Mode",
        desc: "Any revealed hints must be used in subsequent guesses.",
      },
      { key: "highContrast", name: "High Contrast", desc: "For improved color visibility." },
      { key: "reduceMotion", name: "Reduce Motion", desc: "Minimize animations." },
      { key: "sound", name: "Sound Effects", desc: "Subtle click and win sounds." },
      { key: "keyboardHints", name: "Keyboard Hints", desc: "Color the on-screen keys." },
      { key: "autoFocus", name: "Auto Focus", desc: "Capture keystrokes automatically." },
    ];
    const wrap = document.createElement("div");
    wrap.innerHTML =
      `<h2>Settings</h2>` +
      rows
        .map(
          (r) => `
      <div class="setting-row">
        <div class="txt"><div class="name">${r.name}</div><div class="desc">${r.desc}</div></div>
        <label class="switch"><input type="checkbox" data-setting="${r.key}" ${settings[r.key] ? "checked" : ""}><span class="slider"></span></label>
      </div>
    `,
        )
        .join("") +
      `
      <div class="setting-row">
        <div class="txt"><div class="name">Reset Statistics</div><div class="desc">Erases all game history.</div></div>
        <button class="primary-btn secondary" id="resetStats">Reset</button>
      </div>`;
    openModal(wrap);
    wrap.querySelectorAll("input[data-setting]").forEach((el) => {
      el.addEventListener("change", () => {
        settings[el.dataset.setting] = el.checked;
        saveJSON(SETTINGS_KEY, settings);
        applySettings();
        renderKeyboard();
      });
    });
    wrap.querySelector("#resetStats").addEventListener("click", () => {
      if (confirm("Reset all statistics? This cannot be undone.")) {
        stats = { ...defaultStats, distribution: [0, 0, 0, 0, 0, 0] };
        saveJSON(STATS_KEY, stats);
        toast("Statistics reset");
      }
    });
  }

  function openHelpModal() {
    const wrap = document.createElement("div");
    wrap.className = "help";
    wrap.innerHTML = `
      <h2>How To Play</h2>
      <p>Guess the Wordle in 6 tries. Each guess must be a valid 5-letter word. The color of the tiles will change to show how close your guess was.</p>
      <h3 style="margin-top:14px;font-size:14px">Examples</h3>
      <div class="help-row"><div class="tile correct">W</div><div class="tile">E</div><div class="tile">A</div><div class="tile">R</div><div class="tile">Y</div></div>
      <p><b>W</b> is in the word and in the correct spot.</p>
      <div class="help-row"><div class="tile">P</div><div class="tile present">I</div><div class="tile">L</div><div class="tile">L</div><div class="tile">S</div></div>
      <p><b>I</b> is in the word but in the wrong spot.</p>
      <div class="help-row"><div class="tile">V</div><div class="tile">A</div><div class="tile">G</div><div class="tile absent">U</div><div class="tile">E</div></div>
      <p><b>U</b> is not in the word in any spot.</p>
      <p style="margin-top:12px;color:var(--muted);font-size:12px">A new Daily puzzle is available each day. Try Random for unlimited play.</p>`;
    openModal(wrap);
  }

  // ---------- Hints ----------
  function giveHint() {
    if (game.status !== "playing") return toast("Game already over");
    const used = game.hintsUsed;
    if (used.length >= 3) return toast("No hints left");
    game.hintTainted = true;
    if (used.length === 0) {
      const vowels = "AEIOU".split("").filter((v) => game.answer.includes(v));
      const guessed = new Set(game.guesses.join(""));
      const unrev = vowels.find((v) => !guessed.has(v)) || vowels[0];
      used.push("vowel");
      toast(`Contains the vowel ${unrev}`);
    } else if (used.length === 1) {
      const cat = WORD_CATEGORIES[game.answer] || "object";
      used.push("category");
      toast(`Category: ${cat}`);
    } else {
      // reveal an unrevealed correct position
      const revealedGreens = new Set();
      game.guesses.forEach((g) => {
        const ev = evaluate(g, game.answer);
        ev.forEach((s, i) => {
          if (s === "correct") revealedGreens.add(i);
        });
      });
      const options = [];
      for (let i = 0; i < WORD_LENGTH; i++) if (!revealedGreens.has(i)) options.push(i);
      if (options.length === 0) return toast("Nothing left to reveal");
      const pos = options[Math.floor(Math.random() * options.length)];
      used.push("letter");
      toast(`Position ${pos + 1} is ${game.answer[pos]}`);
    }
    saveGame();
  }

  // ---------- Toasts ----------
  const toaster = document.getElementById("toaster");
  function toast(msg, ms = 1600) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toaster.appendChild(el);
    setTimeout(() => el.classList.add("fade"), ms);
    setTimeout(() => el.remove(), ms + 260);
  }

  // ---------- Share ----------
  function share() {
    const header = mode === "daily" ? `Wordle #${dayNumber()}` : `Wordle Random`;
    const score =
      game.status === "won"
        ? `${game.guesses.length}/${MAX_GUESSES}${game.hintTainted ? "*" : ""}`
        : `X/${MAX_GUESSES}`;
    const grid = game.guesses
      .map((g) => {
        const ev = evaluate(g, game.answer);
        return ev.map((s) => (s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛")).join("");
      })
      .join("\n");
    const text = `${header} ${score}\n\n${grid}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => copyText(text));
    } else {
      copyText(text);
    }
  }
  function copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast("Copied to clipboard"))
        .catch(fallback);
    } else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("Copied to clipboard");
      } catch {}
      ta.remove();
    }
  }

  // ---------- Confetti ----------
  const canvas = document.getElementById("confetti");
  function confetti() {
    if (settings.reduceMotion) return;
    canvas.classList.add("on");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);
    const colors = ["#6aaa64", "#c9b458", "#ffffff", "#f5793a", "#85c0f9"];
    const bits = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      s: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
      r: Math.random() * Math.PI,
    }));
    let frames = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      bits.forEach((b) => {
        b.x += b.vx;
        b.y += b.vy;
        b.r += 0.1;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.6);
        ctx.restore();
      });
      frames++;
      if (frames < 180) requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, W, H);
        canvas.classList.remove("on");
      }
    })();
  }

  // ---------- Settings apply ----------
  function applySettings() {
    document.body.classList.toggle("high-contrast", !!settings.highContrast);
    document.body.classList.toggle("reduce-motion", !!settings.reduceMotion);
  }

  // ---------- Wire up ----------
  document.getElementById("statsBtn").addEventListener("click", openStatsModal);
  document.getElementById("helpBtn").addEventListener("click", openHelpModal);
  document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("hintBtn").addEventListener("click", giveHint);
  document.getElementById("modeBtn").addEventListener("click", () => {
    const next = mode === "daily" ? "random" : "daily";
    if (next === "daily") {
      loadDailyOrNew();
    } else {
      newGame("random");
    }
    toast(next === "daily" ? "Daily challenge" : "Random word");
  });

  function loadDailyOrNew() {
    const g = loadJSON(STORAGE_KEY, null);
    if (g && g.mode === "daily" && g.day === todayStamp()) {
      game = g;
      mode = "daily";
      renderAll();
    } else newGame("daily");
  }

  document.addEventListener("keydown", (e) => {
    if (!settings.autoFocus) return;
    if (modalRoot.classList.contains("open")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (k === "ENTER") {
      e.preventDefault();
      handleKey("ENTER");
    } else if (k === "BACKSPACE") {
      e.preventDefault();
      handleKey("BACK");
    } else if (/^[A-Z]$/.test(k)) {
      e.preventDefault();
      handleKey(k);
    }
  });

  // Prevent double-tap zoom on iOS
  let lastTap = 0;
  let lastTapTarget = null;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      const target = e.target;
      if (now - lastTap < 300 && target === lastTapTarget) {
        e.preventDefault();
      }
      lastTap = now;
      lastTapTarget = target;
    },
    { passive: false },
  );

  // Boot
  sizeBoard();
  applySettings();
  loadGame();
  // Show help modal once
  if (!localStorage.getItem("wordle.seenHelp")) {
    openHelpModal();
    localStorage.setItem("wordle.seenHelp", "1");
  }
})();
