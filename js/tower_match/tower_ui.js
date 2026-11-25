/**
 * ============================================================================
 * واجهة اللعب الطولية بيد واحدة والمؤثرات الصوتية والبصرية — «برج التحدي اللانهائي»
 * المسار في مستودع عالم التحديات: js/tower_match/tower_ui.js
 * - واجهة مستقلة تماماً بملء الشاشة (Portrait One-Handed) لا تتداخل مع اللعبتين السابقتين
 * - الثلث العلوي: مسرح البرج (البطل مقابل الحارس/الزعيم + شريط الصحة + العداد السريع + النقاط)
 * - الثلثان السفليان: لوحة Match-3 تفاعلية 6×6 تدعم اللمس والسحب (Swipe & Tap)
 * - نافذة «الانسحاب الآمن أو المخاطرة» بعد كل زعيم + زر المهارة النشطة للشخصيات الـ 18
 * - مؤثرات صوتية خفيفة مدمجة عبر Web Audio API (صفر ملفات صوتية إضافية)
 * ============================================================================
 */
(function () {
  if (window.MoaathTowerUI) return;

  // --------------------------------------------------------------------------
  // 1. محرك مؤثرات صوتية خفيف (Web Audio API)
  // --------------------------------------------------------------------------
  const SFX = {
    ctx: null,
    muted: false,
    _ensure() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },
    tone(freq, dur = 0.09, type = "sine", vol = 0.14, slideTo = null) {
      const ctx = this._ensure();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) {
          osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
        }
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur + 0.01);
      } catch (_) {}
    },
    swap() { this.tone(360, 0.06, "triangle", 0.1, 480); },
    invalid() { this.tone(180, 0.12, "sawtooth", 0.08, 120); },
    match(combo = 1) {
      const base = 440 + Math.min(6, combo - 1) * 85;
      this.tone(base, 0.11, "sine", 0.15, base * 1.25);
    },
    special() {
      this.tone(240, 0.22, "sawtooth", 0.16, 820);
      setTimeout(() => this.tone(620, 0.18, "triangle", 0.14, 980), 70);
    },
    skill() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.12, "triangle", 0.14), i * 55);
      });
    },
    floorClear() {
      [440, 554, 659, 880].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.14, "sine", 0.15), i * 70);
      });
    },
    tickWarn() { this.tone(880, 0.05, "square", 0.06); },
    gameOver() {
      [392, 349, 311, 261].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.18, "triangle", 0.13), i * 110);
      });
    }
  };

  // خريطة صور الشخصيات المتوافقة مع مجلد assets/chars/
  const CHAR_IMG_MAP = {
    buddy: "./assets/chars/buddy.jpg",
    lolo: "./assets/chars/lulu.jpg",
    noor: "./assets/chars/noor.jpg",
    chef: "./assets/chars/chef.jpg",
    pastry: "./assets/chars/pastry.jpg",
    athlete: "./assets/chars/athlete.jpg",
    sheikh: "./assets/chars/sheikh.jpg",
    saver: "./assets/chars/saver.jpg",
    homemaker: "./assets/chars/sara.jpg",
    coach_sakhr: "./assets/chars/coach_sakhr.jpg",
    grand_chef: "./assets/chars/grand_chef.jpg",
    princess_layla: "./assets/chars/princess_layla.jpg",
    butler_farid: "./assets/chars/butler_farid.jpg",
    friend_fadi: "./assets/chars/friend_fadi.jpg",
    anime_zain: "./assets/chars/anime_zain.jpg",
    anime_ryu: "./assets/chars/anime_ryu.jpg",
    anime_ritaj: "./assets/chars/anime_ritaj.jpg",
    friend_saad: "./assets/chars/saad.jpg"
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  // --------------------------------------------------------------------------
  // 2. حقن أنماط الواجهة الطولية (Scoped CSS)
  // --------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("moaathTowerUiStyles")) return;
    const st = document.createElement("style");
    st.id = "moaathTowerUiStyles";
    st.textContent = `
      #moaathTowerOverlay {
        position: fixed; inset: 0; z-index: 99990;
        display: none; flex-direction: column;
        background: radial-gradient(circle at 50% 18%, #1e293b 0%, #0b1120 65%, #050811 100%);
        color: #f8fafc; direction: rtl;
        font-family: system-ui, -apple-system, Tahoma, sans-serif;
        user-select: none; -webkit-user-select: none;
        touch-action: manipulation; overflow: hidden;
      }
      .tm-shell {
        width: 100%; max-width: 460px; height: 100%;
        margin: 0 auto; display: flex; flex-direction: column;
        padding: 8px 10px 10px 10px; box-sizing: border-box;
      }
      /* الشريط العلوي */
      .tm-hud {
        display: flex; align-items: center; justify-content: space-between;
        gap: 6px; margin-bottom: 6px;
      }
      .tm-pill {
        background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(212, 175, 55, 0.45);
        border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 800;
        display: inline-flex; align-items: center; gap: 4px; color: #f8fafc;
      }
      .tm-pill-gold { color: #facc15; border-color: #d4af37; }
      .tm-pill-btn { cursor: pointer; background: rgba(255,255,255,0.08); }
      .tm-pill-exit { border-color: rgba(239,68,68,0.65); color: #fecaca; background: rgba(239,68,68,0.18); cursor: pointer; }

      /* شريط العداد التنازلي السريع */
      .tm-timer-wrap {
        position: relative; height: 18px; border-radius: 999px;
        background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.45);
        overflow: hidden; margin-bottom: 8px;
      }
      .tm-timer-fill {
        height: 100%; width: 80%; border-radius: 999px;
        background: linear-gradient(90deg, #0ea5e9, #22c55e);
        transition: width 0.12s linear, background 0.25s ease;
      }
      .tm-timer-fill.is-warn {
        background: linear-gradient(90deg, #ef4444, #f97316);
        animation: tmPulseWarn 0.45s ease-in-out infinite alternate;
      }
      .tm-timer-fill.is-frozen {
        background: linear-gradient(90deg, #38bdf8, #e0f2fe);
      }
      .tm-timer-label {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 10.5px; font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,0.85);
      }

      /* الثلث العلوي: مسرح البرج */
      .tm-stage {
        position: relative; border-radius: 16px;
        border: 1.5px solid rgba(212, 175, 55, 0.45);
        background: linear-gradient(180deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95));
        padding: 10px 12px; margin-bottom: 8px; overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      }
      .tm-stage.is-boss {
        border-color: #facc15;
        box-shadow: 0 0 22px rgba(250, 204, 21, 0.28);
      }
      .tm-arena-row {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
      }
      .tm-fighter {
        display: flex; flex-direction: column; align-items: center; width: 34%;
      }
      .tm-avatar {
        width: 62px; height: 62px; border-radius: 50%; object-fit: cover;
        border: 2.5px solid #d4af37; background: #0f172a;
        box-shadow: 0 4px 14px rgba(0,0,0,0.55);
        transition: transform 0.18s ease;
      }
      .tm-avatar.is-hit {
        transform: scale(0.9) translateX(-6px);
        filter: brightness(1.55);
      }
      .tm-avatar.is-attack {
        transform: scale(1.1) translateX(-8px);
      }
      .tm-fighter-name {
        font-size: 10px; font-weight: 800; color: #e2e8f0; margin-top: 4px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;
      }
      .tm-center-col {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
      }
      .tm-hp-wrap {
        width: 100%; height: 14px; border-radius: 999px;
        background: rgba(0,0,0,0.55); border: 1px solid rgba(239,68,68,0.55);
        overflow: hidden; position: relative;
      }
      .tm-hp-fill {
        height: 100%; width: 100%;
        background: linear-gradient(90deg, #dc2626, #f97316);
        transition: width 0.2s ease;
      }
      .tm-hp-text {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 9.5px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000;
      }
      .tm-combo-badge {
        font-size: 11px; font-weight: 900; color: #fde047;
        min-height: 16px; text-align: center;
      }

      /* مؤثرات النصوص الطائرة فوق المسرح */
      .tm-float-fx {
        position: absolute; left: 50%; top: 38%;
        transform: translate(-50%, -50%);
        font-size: 15px; font-weight: 900; pointer-events: none;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
        animation: tmFloatUp 0.75s ease-out forwards;
        z-index: 5;
      }

      /* الثلثان السفليان: لوحة Match-3 */
      .tm-board-wrap {
        flex: 1; display: flex; align-items: center; justify-content: center;
        min-height: 0; padding: 2px 0;
      }
      .tm-board {
        width: min(94vw, 410px, 52vh);
        height: min(94vw, 410px, 52vh);
        display: grid; grid-template-columns: repeat(6, 1fr);
        grid-template-rows: repeat(6, 1fr); gap: 5px;
        background: rgba(15, 23, 42, 0.85);
        border: 2px solid rgba(212, 175, 55, 0.4);
        border-radius: 16px; padding: 7px; box-sizing: border-box;
        touch-action: none; position: relative;
        box-shadow: inset 0 0 24px rgba(0,0,0,0.65);
      }
      .tm-cell {
        position: relative; border-radius: 11px;
        background: rgba(30, 41, 59, 0.55);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: transform 0.14s ease, box-shadow 0.14s ease;
        overflow: hidden;
      }
      .tm-cell img {
        width: 92%; height: 92%; object-fit: contain; pointer-events: none;
        transition: transform 0.15s ease;
      }
      .tm-cell.is-selected {
        transform: scale(1.08);
        box-shadow: 0 0 0 2.5px #facc15, 0 0 14px rgba(250, 204, 21, 0.75);
        z-index: 3;
      }
      .tm-cell.is-hint {
        box-shadow: 0 0 0 2.5px #38bdf8, 0 0 14px rgba(56, 189, 248, 0.85);
        animation: tmPulseHint 0.7s ease-in-out infinite alternate;
      }
      .tm-cell.is-shake {
        animation: tmShake 0.25s ease;
      }
      .tm-cell.is-locked::after {
        content: "🔒";
        position: absolute; inset: 0;
        background: rgba(15, 23, 42, 0.55);
        border: 2px solid #94a3b8; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
      }

      /* شريط مهارة الشخصية السفلي */
      .tm-skill-bar {
        margin-top: 8px; display: flex; gap: 8px; align-items: center;
      }
      .tm-skill-btn {
        flex: 1; position: relative; overflow: hidden;
        border: 1.5px solid rgba(192, 132, 252, 0.55);
        background: rgba(30, 27, 75, 0.9); color: #e2e8f0;
        border-radius: 12px; padding: 10px 12px; font-size: 12px; font-weight: 900;
        cursor: pointer; transition: transform 0.15s ease, box-shadow 0.2s ease;
      }
      .tm-skill-btn.is-ready {
        border-color: #facc15; color: #0b1120;
        background: linear-gradient(135deg, #facc15, #f59e0b);
        box-shadow: 0 0 18px rgba(250, 204, 21, 0.6);
        animation: tmPulseWarn 0.75s ease-in-out infinite alternate;
      }
      .tm-skill-fill {
        position: absolute; top: 0; right: 0; bottom: 0; width: 0%;
        background: rgba(168, 85, 247, 0.35); pointer-events: none;
        transition: width 0.2s ease;
      }
      .tm-skill-txt { position: relative; z-index: 2; }

      /* نوافذ القرار والنهاية */
      .tm-modal-backdrop {
        position: absolute; inset: 0; z-index: 20;
        background: rgba(5, 8, 17, 0.86); backdrop-filter: blur(5px);
        display: none; align-items: center; justify-content: center; padding: 16px;
      }
      .tm-modal-card {
        width: 100%; max-width: 360px; background: #151f32;
        border: 2px solid #d4af37; border-radius: 18px; padding: 18px;
        text-align: center; box-shadow: 0 14px 36px rgba(0,0,0,0.65);
      }
      .tm-modal-title { font-size: 17px; font-weight: 900; color: #facc15; margin-bottom: 8px; }
      .tm-modal-sub { font-size: 12.5px; color: #cbd5e1; line-height: 1.6; margin-bottom: 14px; }
      .tm-modal-stats {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px;
      }
      .tm-stat-box {
        background: #0b1120; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px; padding: 8px;
      }
      .tm-stat-val { font-size: 15px; font-weight: 900; color: #4ade80; }
      .tm-stat-lbl { font-size: 10px; color: #94a3b8; }
      .tm-btn {
        width: 100%; padding: 11px; border-radius: 10px; border: none;
        font-size: 13px; font-weight: 900; cursor: pointer; margin-top: 7px;
      }
      .tm-btn-gold { background: linear-gradient(135deg, #facc15, #d4af37); color: #0b1120; }
      .tm-btn-green { background: #16a34a; color: #fff; }
      .tm-btn-outline { background: transparent; border: 1px solid #64748b; color: #cbd5e1; }

      @keyframes tmPulseWarn {
        from { transform: scale(1); } to { transform: scale(1.025); }
      }
      @keyframes tmPulseHint {
        from { transform: scale(1); } to { transform: scale(1.07); }
      }
      @keyframes tmFloatUp {
        0% { opacity: 1; transform: translate(-50%, -20%) scale(0.9); }
        100% { opacity: 0; transform: translate(-50%, -140%) scale(1.15); }
      }
      @keyframes tmShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
    `;
    document.head.appendChild(st);
  }

  // --------------------------------------------------------------------------
  // 3. إدارة الواجهة والتفاعل باللمس والسحب
  // --------------------------------------------------------------------------
  let engine = null;
  let onCompleteCb = null;
  let selectedCell = null;
  let hintPair = null;
  let pointerStart = null;
  let lastWarnSec = -1;

  function ensureDOM() {
    if (document.getElementById("moaathTowerOverlay")) {
      return document.getElementById("moaathTowerOverlay");
    }
    injectStyles();
    const ov = document.createElement("div");
    ov.id = "moaathTowerOverlay";
    ov.innerHTML = `
      <div class="tm-shell">
        <div class="tm-hud">
          <div style="display:flex; gap:5px; align-items:center;">
            <span id="tmFloorPill" class="tm-pill tm-pill-gold">🏰 الطابق 1</span>
            <span id="tmScorePill" class="tm-pill">🪙 0</span>
            <span id="tmMultPill" class="tm-pill" style="color:#4ade80;">×1.0</span>
          </div>
          <div style="display:flex; gap:5px; align-items:center;">
            <button type="button" id="tmMuteBtn" class="tm-pill tm-pill-btn">🔊</button>
            <button type="button" id="tmExitBtn" class="tm-pill tm-pill-exit">انسحاب</button>
          </div>
        </div>

        <div class="tm-timer-wrap">
          <div id="tmTimerFill" class="tm-timer-fill"></div>
          <div id="tmTimerLabel" class="tm-timer-label">⏱️ 35.0 ثانية</div>
        </div>

        <div id="tmStage" class="tm-stage">
          <div class="tm-arena-row">
            <div class="tm-fighter">
              <img id="tmHeroImg" class="tm-avatar" src="./assets/chars/buddy.jpg" alt="بطل">
              <div id="tmHeroName" class="tm-fighter-name">بندق الودود</div>
            </div>
            <div class="tm-center-col">
              <div id="tmBossTitle" style="font-size:11px; font-weight:900; color:#facc15; text-align:center;">حارس الطابق</div>
              <div class="tm-hp-wrap">
                <div id="tmHpFill" class="tm-hp-fill"></div>
                <div id="tmHpText" class="tm-hp-text">100 / 100</div>
              </div>
              <div id="tmComboBadge" class="tm-combo-badge"></div>
            </div>
            <div class="tm-fighter">
              <img id="tmBossImg" class="tm-avatar" src="./assets/tower_match/boss_1_bronze.png" alt="زعيم">
              <div id="tmBossTag" class="tm-fighter-name">حارس البرج</div>
            </div>
          </div>
        </div>

        <div class="tm-board-wrap">
          <div id="tmBoard" class="tm-board"></div>
        </div>

        <div class="tm-skill-bar">
          <button type="button" id="tmSkillBtn" class="tm-skill-btn">
            <div id="tmSkillFill" class="tm-skill-fill"></div>
            <span id="tmSkillTxt" class="tm-skill-txt">⭐ شحن المهارة: 0%</span>
          </button>
        </div>
      </div>

      <!-- نافذة قرار الزعيم (انسحاب آمن أو مخاطرة) -->
      <div id="tmBossModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div class="tm-modal-title">👑 هزمت زعيم الطابق!</div>
          <div id="tmBossModalSub" class="tm-modal-sub"></div>
          <button type="button" id="tmContinueBtn" class="tm-btn tm-btn-gold">🔥 الصعود والمخاطرة (مضاعفة النقاط)</button>
          <button type="button" id="tmRetreatBtn" class="tm-btn tm-btn-green">🛡️ الانسحاب الآمن وحفظ النقاط</button>
        </div>
      </div>

      <!-- نافذة نهاية الجولة -->
      <div id="tmEndModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div id="tmEndTitle" class="tm-modal-title">🏆 انتهت الجولة!</div>
          <div class="tm-modal-stats">
            <div class="tm-stat-box"><div id="tmEndScore" class="tm-stat-val">0</div><div class="tm-stat-lbl">النقاط النهائية</div></div>
            <div class="tm-stat-box"><div id="tmEndFloor" class="tm-stat-val">1</div><div class="tm-stat-lbl">أعلى طابق</div></div>
            <div class="tm-stat-box"><div id="tmEndBosses" class="tm-stat-val">0</div><div class="tm-stat-lbl">زعماء مهزومون</div></div>
            <div class="tm-stat-box"><div id="tmEndCombo" class="tm-stat-val">×1</div><div class="tm-stat-lbl">أعلى كومبو</div></div>
          </div>
          <button type="button" id="tmFinishCloseBtn" class="tm-btn tm-btn-gold">✅ اعتماد النتيجة والعودة</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // ربط الأزرار الثابتة
    document.getElementById("tmMuteBtn").onclick = () => {
      SFX.muted = !SFX.muted;
      document.getElementById("tmMuteBtn").textContent = SFX.muted ? "🔇" : "🔊";
    };
    document.getElementById("tmExitBtn").onclick = () => {
      if (!engine || engine.status === "ended") return closeUI();
      if (confirm("هل تريد الانسحاب وحفظ نقاطك الحالية؟")) {
        engine.retreatSafely();
      }
    };
    document.getElementById("tmSkillBtn").onclick = () => {
      if (engine) engine.activateSkill();
    };
    document.getElementById("tmContinueBtn").onclick = () => {
      document.getElementById("tmBossModal").style.display = "none";
      if (engine) engine.continueClimbing();
    };
    document.getElementById("tmRetreatBtn").onclick = () => {
      document.getElementById("tmBossModal").style.display = "none";
      if (engine) engine.retreatSafely();
    };

    bindBoardInput();
    return ov;
  }

  function spawnFloatText(text, color = "#fde047") {
    const stage = document.getElementById("tmStage");
    if (!stage) return;
    const el = document.createElement("div");
    el.className = "tm-float-fx";
    el.style.color = color;
    el.textContent = text;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 760);
  }

  function renderBoard(snapshot) {
    const boardEl = document.getElementById("tmBoard");
    if (!boardEl || !snapshot) return;
    const assets = window.MoaathTowerAssets;
    let html = "";

    for (let r = 0; r < snapshot.length; r++) {
      for (let c = 0; c < snapshot[r].length; c++) {
        const cell = snapshot[r][c];
        const isSel = selectedCell && selectedCell.r === r && selectedCell.c === c;
        const isHint = hintPair && (
          (hintPair.r1 === r && hintPair.c1 === c) ||
          (hintPair.r2 === r && hintPair.c2 === c)
        );
        const cls = [
          "tm-cell",
          isSel ? "is-selected" : "",
          isHint ? "is-hint" : "",
          cell && cell.locked > 0 ? "is-locked" : ""
        ].filter(Boolean).join(" ");

        let imgSrc = "";
        if (cell && assets) {
          if (cell.special && assets.SPECIAL_DEFS[cell.special]) {
            imgSrc = assets.SPECIAL_DEFS[cell.special].src;
          } else if (assets.TILE_DEFS[cell.type]) {
            imgSrc = assets.TILE_DEFS[cell.type].src;
          }
        }
        html += `<div class="${cls}" data-r="${r}" data-c="${c}">${imgSrc ? `<img src="${imgSrc}" alt="${cell.type}">` : ""}</div>`;
      }
    }
    boardEl.innerHTML = html;
  }

  function updateHUD(st) {
    if (!st) return;
    document.getElementById("tmFloorPill").textContent = st.isBossFloor ? `👑 زعيم ط${st.floor}` : `🏰 الطابق ${st.floor}`;
    document.getElementById("tmScorePill").textContent = `🪙 ${st.score.toLocaleString()}`;
    document.getElementById("tmMultPill").textContent = `×${st.riskMultiplier.toFixed(2)}`;

    const stage = document.getElementById("tmStage");
    stage.classList.toggle("is-boss", !!st.isBossFloor);

    const hpPct = Math.max(0, Math.min(100, (st.guardianHp / Math.max(1, st.guardianMaxHp)) * 100));
    document.getElementById("tmHpFill").style.width = `${hpPct}%`;
    document.getElementById("tmHpText").textContent = `${st.guardianHp} / ${st.guardianMaxHp}`;

    document.getElementById("tmBossTitle").textContent = st.isBossFloor
      ? `👑 ${st.bossTheme?.name || "زعيم البرج"}`
      : `حارس الطابق ${st.floor}`;
    document.getElementById("tmBossTag").textContent = st.isBossFloor ? "زعيم البرج" : `المستوى ${st.floor}`;
    if (st.bossTheme?.src) {
      const bImg = document.getElementById("tmBossImg");
      if (bImg.getAttribute("src") !== st.bossTheme.src) bImg.src = st.bossTheme.src;
    }

    // تحديث زر المهارة
    const skBtn = document.getElementById("tmSkillBtn");
    const skFill = document.getElementById("tmSkillFill");
    const skTxt = document.getElementById("tmSkillTxt");
    const ready = st.skillCharge >= 100;
    skBtn.classList.toggle("is-ready", ready);
    skFill.style.width = `${st.skillCharge}%`;
    skTxt.textContent = ready
      ? `⚡ فعّل مهارة «${st.persona?.skillName || "المهارة"}» الآن!`
      : `⭐ ${st.persona?.skillName || "المهارة"}: ${st.skillCharge}%`;

    updateTimerBar(st.timeLeftSec, st.maxTimeSec, st.freezeLeftSec);
  }

  function updateTimerBar(timeLeftSec, maxTimeSec, freezeLeftSec) {
    const fill = document.getElementById("tmTimerFill");
    const lbl = document.getElementById("tmTimerLabel");
    if (!fill || !lbl) return;
    const pct = Math.max(0, Math.min(100, (timeLeftSec / Math.max(1, maxTimeSec)) * 100));
    fill.style.width = `${pct}%`;
    fill.classList.toggle("is-frozen", freezeLeftSec > 0);
    fill.classList.toggle("is-warn", freezeLeftSec <= 0 && timeLeftSec <= 7);
    lbl.textContent = freezeLeftSec > 0
      ? `❄️ الزمن مجمد (${freezeLeftSec.toFixed(1)}ث) — ⏱️ ${timeLeftSec.toFixed(1)}ث`
      : `⏱️ ${timeLeftSec.toFixed(1)} ثانية`;
  }

  function bindBoardInput() {
    const boardEl = document.getElementById("tmBoard");
    if (!boardEl) return;

    const getCellFromEvent = (ev) => {
      const target = ev.target.closest(".tm-cell");
      if (!target) return null;
      return { r: parseInt(target.dataset.r, 10), c: parseInt(target.dataset.c, 10) };
    };

    boardEl.addEventListener("pointerdown", (ev) => {
      if (!engine || engine.status !== "playing") return;
      const cell = getCellFromEvent(ev);
      if (!cell) return;
      pointerStart = { r: cell.r, c: cell.c, x: ev.clientX, y: ev.clientY, swiped: false };
    });

    boardEl.addEventListener("pointermove", (ev) => {
      if (!pointerStart || pointerStart.swiped || !engine || engine.status !== "playing") return;
      const dx = ev.clientX - pointerStart.x;
      const dy = ev.clientY - pointerStart.y;
      if (Math.hypot(dx, dy) < 22) return;

      pointerStart.swiped = true;
      let nr = pointerStart.r;
      let nc = pointerStart.c;
      if (Math.abs(dx) > Math.abs(dy)) nc += dx > 0 ? 1 : -1;
      else nr += dy > 0 ? 1 : -1;

      selectedCell = null;
      hintPair = null;
      engine.performSwap(pointerStart.r, pointerStart.c, nr, nc);
    });

    boardEl.addEventListener("pointerup", (ev) => {
      if (!pointerStart) return;
      const wasSwiped = pointerStart.swiped;
      const startCell = { r: pointerStart.r, c: pointerStart.c };
      pointerStart = null;
      if (wasSwiped || !engine || engine.status !== "playing") return;

      // دعم النقر المزدوج (Tap-to-Tap)
      if (!selectedCell) {
        selectedCell = startCell;
        renderBoard(engine.board.getSnapshot());
        return;
      }
      if (selectedCell.r === startCell.r && selectedCell.c === startCell.c) {
        selectedCell = null;
        renderBoard(engine.board.getSnapshot());
        return;
      }
      if (engine.board.isAdjacent(selectedCell.r, selectedCell.c, startCell.r, startCell.c)) {
        const prev = selectedCell;
        selectedCell = null;
        hintPair = null;
        engine.performSwap(prev.r, prev.c, startCell.r, startCell.c);
      } else {
        selectedCell = startCell;
        renderBoard(engine.board.getSnapshot());
      }
    });
  }

  function closeUI() {
    if (engine) {
      engine.destroy();
      engine = null;
    }
    const ov = document.getElementById("moaathTowerOverlay");
    if (ov) ov.style.display = "none";
  }

  // --------------------------------------------------------------------------
  // 4. نقطة التشغيل العامة: window.MoaathTowerUI.launch(options)
  // --------------------------------------------------------------------------
  function launch(options = {}) {
    if (!window.MoaathTowerEngine || !window.MoaathTowerBoard) {
      alert("⚠️ يرجى التأكد من تحميل ملفات tower_board.js و tower_engine.js");
      return;
    }

    const ov = ensureDOM();
    ov.style.display = "flex";
    document.getElementById("tmBossModal").style.display = "none";
    document.getElementById("tmEndModal").style.display = "none";

    onCompleteCb = typeof options.onComplete === "function" ? options.onComplete : null;
    selectedCell = null;
    hintPair = null;
    lastWarnSec = -1;

    if (engine) engine.destroy();
    engine = new window.MoaathTowerEngine.TowerEngine({
      mode: options.mode || "solo",
      seed: options.seed || `tower_${Date.now()}`,
      sessionId: options.sessionId || null,
      personaId: options.personaId || "buddy"
    });

    // ضبط صورة واسم بطل اللاعب
    const pId = engine.personaId;
    const heroImg = document.getElementById("tmHeroImg");
    heroImg.src = CHAR_IMG_MAP[pId] || `./assets/chars/${pId}.jpg`;
    heroImg.onerror = () => { heroImg.src = "./assets/chars/buddy.jpg"; };
    document.getElementById("tmHeroName").textContent = engine.persona.name;

    // الاشتراك في أحداث المحرك
    engine.on("tick", (t) => {
      updateTimerBar(t.timeLeftSec, t.maxTimeSec, t.freezeLeftSec);
    });

    engine.on("timeWarning", ({ timeLeftSec }) => {
      const secInt = Math.ceil(timeLeftSec);
      if (secInt !== lastWarnSec && secInt > 0) {
        lastWarnSec = secInt;
        SFX.tickWarn();
      }
    });

    engine.on("invalidSwap", ({ r1, c1, r2, c2 }) => {
      SFX.invalid();
      [
        document.querySelector(`.tm-cell[data-r="${r1}"][data-c="${c1}"]`),
        document.querySelector(`.tm-cell[data-r="${r2}"][data-c="${c2}"]`)
      ].forEach((el) => {
        if (!el) return;
        el.classList.add("is-shake");
        setTimeout(() => el.classList.remove("is-shake"), 260);
      });
    });

    engine.on("move", (mv) => {
      if (mv.totals.specialsTriggered > 0) SFX.special();
      else SFX.match(mv.totals.maxCombo);

      // أنيميشن هجوم البطل وإصابة الحارس
      const hImg = document.getElementById("tmHeroImg");
      const bImg = document.getElementById("tmBossImg");
      hImg.classList.add("is-attack");
      bImg.classList.add("is-hit");
      setTimeout(() => { hImg.classList.remove("is-attack"); bImg.classList.remove("is-hit"); }, 220);

      spawnFloatText(`-${mv.damage} ⚔️${mv.addedSec > 0 ? `  +${mv.addedSec}ث ⏱️` : ""}`, "#fca5a5");
      document.getElementById("tmComboBadge").textContent = mv.totals.maxCombo >= 2
        ? `🔥 كومبو ×${mv.totals.maxCombo}! (+${mv.gainedScore})`
        : `+${mv.gainedScore} نقطة`;

      renderBoard(mv.boardAfter);
      updateHUD(mv.state);
    });

    engine.on("skillReady", () => {
      SFX.skill();
      spawnFloatText("⚡ المهارة جاهزة!", "#facc15");
    });

    engine.on("skillUsed", (sk) => {
      SFX.special();
      if (sk.hint) hintPair = sk.hint;
      spawnFloatText(`⚡ ${sk.persona.skillName}!`, "#c084fc");
      renderBoard(sk.boardAfter);
      updateHUD(sk.state);
    });

    engine.on("floorCleared", (fc) => {
      SFX.floorClear();
      spawnFloatText(`🏰 الطابق ${fc.newFloor} (+${fc.timeRefill}ث)`, "#4ade80");
      renderBoard(fc.boardAfter);
      updateHUD(fc.state);
    });

    engine.on("bossDecision", (bd) => {
      SFX.floorClear();
      document.getElementById("tmBossModalSub").innerHTML = `
        هزمت <b>${esc(bd.bossName)}</b> في الطابق <b>${bd.defeatedFloor}</b>!<br>
        نقاطك المضمونة الآن: <b style="color:#4ade80;">${bd.safeScore.toLocaleString()}</b><br>
        إذا واصلت الصعود يرتفع المضاعف إلى <b style="color:#facc15;">×${bd.nextMultiplier}</b> (+18 ثانية).
      `;
      document.getElementById("tmBossModal").style.display = "flex";
    });

    engine.on("gameOver", (summary) => {
      SFX.gameOver();
      document.getElementById("tmEndTitle").textContent =
        summary.endReason === "safe_retreat" ? "🛡️ انسحاب آمن ناجح!" : "⏱️ انتهى الوقت!";
      document.getElementById("tmEndScore").textContent = summary.score.toLocaleString();
      document.getElementById("tmEndFloor").textContent = `ط${summary.highestFloor}`;
      document.getElementById("tmEndBosses").textContent = summary.bossesDefeated;
      document.getElementById("tmEndCombo").textContent = `×${Math.max(1, summary.maxCombo)}`;
      document.getElementById("tmEndModal").style.display = "flex";

      document.getElementById("tmFinishCloseBtn").onclick = () => {
        const cb = onCompleteCb;
        closeUI();
        if (cb) cb(summary);
      };
    });

    const initialState = engine.start();
    renderBoard(engine.board.getSnapshot());
    updateHUD(initialState);
  }

  window.MoaathTowerUI = {
    version: "1.0",
    launch,
    close: closeUI
  };
})();
