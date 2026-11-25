/**
 * ============================================================================
 * واجهة اللعب الطولية بيد واحدة v3.0 Ultra — «برج التحدي اللانهائي»
 * المسار: js/tower_match/tower_ui.js
 * إضافات v3.0:
 * - تتبع دائم للقطع (Persistent DOM + translate3d) مع ارتداد هبوط 60fps
 * - تشغيل سلاسل الكومبو بالتتابع الزمني (Sequential Cascade Playback) + طابور حركات (Input Buffer)
 * - سحب حيّ يتبع الإصبع (Live Drag-Follow) + طبقة جزيئات Canvas + مقذوفات طائرة
 * - إيقاف مؤقت تلقائي عند الخروج لواتساب (visibilitychange) + شاشة متابعة
 * - عداد تحذير هجمة الزعيم + توتر آخر 5 ثوانٍ + إيقاع صوتي ديناميكي + تعليقات الشخصيات
 * - تبدّل بيئة البرج كل 5 طوابق + اختيار بركة Roguelike بعد كل زعيم + انتقال عمودي للطوابق
 * ============================================================================
 */
(function () {
  const TUTORIAL_KEY = "moaath_tower_tutorial_seen_v1";

  const SFX = {
    ctx: null, muted: false, beatTimer: null,
    _ensure() {
      if (this.muted) return null;
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    tone(freq, dur = 0.09, type = "sine", vol = 0.14, slideTo = null) {
      const ctx = this._ensure(); if (!ctx) return;
      try {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.01);
      } catch (_) {}
    },
    haptic(ms = 12) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} },
    invalid() { this.tone(180, 0.12, "sawtooth", 0.08, 120); this.haptic([18, 25, 18]); },
    match(combo = 1) {
      const base = 440 + Math.min(6, combo - 1) * 85;
      this.tone(base, 0.11, "sine", 0.15, base * 1.25);
      this.haptic(combo >= 2 ? 25 : 12);
    },
    special() {
      this.tone(240, 0.22, "sawtooth", 0.16, 820);
      setTimeout(() => this.tone(620, 0.18, "triangle", 0.14, 980), 70);
      this.haptic([35, 30, 45]);
    },
    fever() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.1, "triangle", 0.14), i * 45)); this.haptic(45); },
    skill() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, "triangle", 0.14), i * 55)); this.haptic(35); },
    floorClear() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, "sine", 0.15), i * 70)); this.haptic(40); },
    heartbeat() { this.tone(110, 0.08, "sine", 0.14, 70); setTimeout(() => this.tone(95, 0.08, "sine", 0.11, 60), 140); },
    gameOver() { [392, 349, 311, 261].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle", 0.13), i * 110)); },
    startBeat(fast = false) {
      this.stopBeat();
      const ms = fast ? 380 : 620;
      this.beatTimer = setInterval(() => {
        if (!this.muted) this.tone(fast ? 150 : 120, 0.04, "triangle", 0.045, 80);
      }, ms);
    },
    stopBeat() { if (this.beatTimer) { clearInterval(this.beatTimer); this.beatTimer = null; } }
  };

  const CHAR_IMG_MAP = {
    buddy: "./assets/chars/buddy.jpg", lolo: "./assets/chars/lulu.jpg", noor: "./assets/chars/noor.jpg",
    chef: "./assets/chars/chef.jpg", pastry: "./assets/chars/pastry.jpg", athlete: "./assets/chars/athlete.jpg",
    sheikh: "./assets/chars/sheikh.jpg", saver: "./assets/chars/saver.jpg", homemaker: "./assets/chars/sara.jpg",
    coach_sakhr: "./assets/chars/coach_sakhr.jpg", grand_chef: "./assets/chars/grand_chef.jpg",
    princess_layla: "./assets/chars/princess_layla.jpg", butler_farid: "./assets/chars/butler_farid.jpg",
    friend_fadi: "./assets/chars/friend_fadi.jpg", anime_zain: "./assets/chars/anime_zain.jpg",
    anime_ryu: "./assets/chars/anime_ryu.jpg", anime_ritaj: "./assets/chars/anime_ritaj.jpg",
    friend_saad: "./assets/chars/saad.jpg"
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function injectStyles() {
    if (document.getElementById("moaathTowerUiStyles")) return;
    const st = document.createElement("style");
    st.id = "moaathTowerUiStyles";
    st.textContent = `
      #moaathTowerOverlay {
        position: fixed; inset: 0; z-index: 99990;
        display: none; flex-direction: column;
        background: radial-gradient(circle at 50% 18%, #1e293b 0%, #0b1120 65%, #050811 100%);
        color: #f8fafc; direction: rtl; font-family: system-ui, -apple-system, Tahoma, sans-serif;
        user-select: none; -webkit-user-select: none; touch-action: manipulation; overflow: hidden;
        transition: background 0.5s ease;
      }
      #moaathTowerOverlay.is-shake-screen { animation: tmScreenShake 0.28s ease; }
      #moaathTowerOverlay.is-fever { box-shadow: inset 0 0 42px rgba(250, 204, 21, 0.6); }
      #moaathTowerOverlay.is-overdrive { box-shadow: inset 0 0 56px rgba(249, 115, 22, 0.85); }
      #moaathTowerOverlay.is-last-stand { box-shadow: inset 0 0 60px rgba(239, 68, 68, 0.8); }

      .tm-shell { width: 100%; max-width: 460px; height: 100%; margin: 0 auto; display: flex; flex-direction: column; padding: 7px 10px 9px 10px; box-sizing: border-box; }
      .tm-hud { display: flex; align-items: center; justify-content: space-between; gap: 5px; margin-bottom: 4px; }
      .tm-pill { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(212, 175, 55, 0.45); border-radius: 999px; padding: 3px 9px; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; color: #f8fafc; }
      .tm-pill-gold { color: #facc15; border-color: #d4af37; }
      .tm-pill-btn { cursor: pointer; background: rgba(255,255,255,0.08); }
      .tm-pill-exit { border-color: rgba(239,68,68,0.65); color: #fecaca; background: rgba(239,68,68,0.18); cursor: pointer; }

      .tm-map-row { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px; }
      .tm-map-dot { width: 22px; height: 7px; border-radius: 999px; background: rgba(148,163,184,0.25); border: 1px solid rgba(255,255,255,0.15); }
      .tm-map-dot.is-done { background: #22c55e; border-color: #4ade80; }
      .tm-map-dot.is-now { background: #facc15; border-color: #fff; transform: scale(1.15); }
      .tm-map-boss { font-size: 13px; opacity: 0.55; }
      .tm-map-boss.is-now { opacity: 1; transform: scale(1.2); }

      .tm-timer-wrap { position: relative; height: 17px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.45); overflow: hidden; margin-bottom: 4px; }
      .tm-timer-fill { height: 100%; width: 80%; border-radius: 999px; background: linear-gradient(90deg, #0ea5e9, #22c55e); transition: width 0.12s linear; }
      .tm-timer-fill.is-warn { background: linear-gradient(90deg, #ef4444, #f97316); animation: tmPulseWarn 0.45s ease-in-out infinite alternate; }
      .tm-timer-fill.is-frozen { background: linear-gradient(90deg, #38bdf8, #e0f2fe); }
      .tm-timer-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,0.85); }

      .tm-buffs-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; min-height: 16px; margin-bottom: 4px; }
      .tm-buff-chip { font-size: 9px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: rgba(250,204,21,0.18); border: 1px solid #facc15; color: #fde047; }
      .tm-ghost-bar { display: none; font-size: 10px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.4); border-radius: 8px; padding: 3px 8px; margin-bottom: 4px; justify-content: space-between; align-items: center; color: #7dd3fc; font-weight: 800; }

      .tm-stage { position: relative; border-radius: 15px; border: 1.5px solid rgba(212, 175, 55, 0.45); background: linear-gradient(180deg, rgba(30,41,59,0.85), rgba(15,23,42,0.95)); padding: 8px 10px; margin-bottom: 6px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.45); transition: transform 0.35s ease; }
      .tm-stage.is-scroll-up { animation: tmTowerClimb 0.45s ease; }
      .tm-stage.is-boss { border-color: #facc15; box-shadow: 0 0 22px rgba(250, 204, 21, 0.3); }
      .tm-arena-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .tm-fighter { display: flex; flex-direction: column; align-items: center; width: 31%; position: relative; }
      .tm-avatar { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2.5px solid #d4af37; background: #0f172a; transition: transform 0.16s ease; }
      .tm-avatar.is-hit { transform: scale(0.88) translateX(-6px); filter: brightness(1.6); }
      .tm-avatar.is-attack { transform: scale(1.1) translateX(-8px); }
      .tm-fighter-name { font-size: 9.5px; font-weight: 800; color: #e2e8f0; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 105px; }

      /* عداد تحذير هجمة الزعيم */
      .tm-boss-atk-bar { width: 85%; height: 5px; background: rgba(0,0,0,0.5); border-radius: 999px; margin-top: 3px; overflow: hidden; display: none; }
      .tm-boss-atk-fill { height: 100%; width: 0%; background: #facc15; transition: width 0.12s linear; }
      .tm-boss-atk-fill.is-danger { background: #ef4444; animation: tmPulseWarn 0.3s infinite alternate; }

      .tm-center-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .tm-hp-wrap { width: 100%; height: 13px; border-radius: 999px; background: rgba(0,0,0,0.55); border: 1px solid rgba(239,68,68,0.55); overflow: hidden; position: relative; }
      .tm-hp-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #dc2626, #f97316); transition: width 0.2s ease; }
      .tm-hp-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000; }
      .tm-combo-badge { font-size: 10.5px; font-weight: 900; color: #fde047; min-height: 15px; text-align: center; }

      .tm-float-fx { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: 14px; font-weight: 900; pointer-events: none; text-shadow: 0 2px 6px rgba(0,0,0,0.9); animation: tmFloatUp 0.8s ease-out forwards; z-index: 8; white-space: nowrap; }
      .tm-proj { position: fixed; width: 12px; height: 12px; border-radius: 50%; pointer-events: none; z-index: 99999; transition: transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.34s ease; }

      /* اللوحة السلسة 60fps بـ Persistent Absolute Tiles + Canvas Particles */
      .tm-board-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; padding: 2px 0; position: relative; }
      .tm-board-box { position: relative; width: min(94vw, 400px, 48vh); height: min(94vw, 400px, 48vh); background: rgba(15, 23, 42, 0.85); border: 2px solid rgba(212, 175, 55, 0.4); border-radius: 16px; padding: 6px; box-sizing: border-box; touch-action: none; box-shadow: inset 0 0 24px rgba(0,0,0,0.65); overflow: hidden; }
      .tm-board-layer { position: relative; width: 100%; height: 100%; }
      #tmParticleCanvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
      .tm-shockwave { position: absolute; inset: 0; border-radius: 16px; border: 3px solid #facc15; pointer-events: none; animation: tmShock 0.42s ease-out forwards; z-index: 9; }

      .tm-tile {
        position: absolute; top: 0; left: 0; border-radius: 11px;
        background: rgba(30, 41, 59, 0.58); display: flex; align-items: center; justify-content: center;
        cursor: pointer; will-change: transform, opacity;
        transition: transform 0.22s cubic-bezier(0.22, 1.28, 0.36, 1), opacity 0.16s ease, box-shadow 0.15s ease;
        box-sizing: border-box; overflow: hidden;
      }
      .tm-tile.is-dragging { transition: none !important; z-index: 6; }
      .tm-tile.is-popping { transform: scale(1.22) !important; opacity: 0 !important; }
      .tm-tile img { width: 90%; height: 90%; object-fit: contain; pointer-events: none; }
      .tm-tile.is-col-blast img { transform: rotate(90deg); }
      .tm-tile.is-golden { box-shadow: 0 0 0 2px #facc15, inset 0 0 12px rgba(250,204,21,0.55); }
      .tm-tile.is-golden::before { content: "✨"; position: absolute; top: 1px; right: 2px; font-size: 10px; z-index: 2; }
      .tm-tile.is-wildcard { background: linear-gradient(135deg, #ef4444, #facc15, #10b981, #a855f7); box-shadow: 0 0 10px #fff; }
      .tm-tile.is-wildcard::before { content: "🃏"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; }
      .tm-tile.is-barrel { background: #450a0a; border: 2px solid #f97316; }
      .tm-tile.is-barrel::before { content: "🛢️"; font-size: 24px; }
      .tm-tile.is-chest { background: #422006; border: 2px solid #facc15; animation: tmPulseHint 0.5s infinite alternate; }
      .tm-tile.is-chest::before { content: "🎁"; font-size: 24px; }
      .tm-tile.is-stone { background: #1e293b; border: 2px solid #475569; opacity: 0.9; cursor: not-allowed; }
      .tm-tile.is-stone::before { content: "🪨"; font-size: 20px; }

      .tm-tile.is-selected { box-shadow: 0 0 0 2.5px #facc15, 0 0 14px rgba(250, 204, 21, 0.8); z-index: 4; }
      .tm-tile.is-hint { box-shadow: 0 0 0 2.5px #38bdf8, 0 0 14px rgba(56, 189, 248, 0.85); }
      .tm-tile.is-locked::after { content: "🔒"; position: absolute; inset: 0; background: rgba(15, 23, 42, 0.6); border: 2px solid #94a3b8; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; }
      .tm-tile.is-ice-2::after { content: "❄️❄️"; position: absolute; inset: 0; background: rgba(56, 189, 248, 0.38); border: 2px solid #7dd3fc; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 11px; }
      .tm-tile.is-ice-1::after { content: "❄️"; position: absolute; inset: 0; background: rgba(56, 189, 248, 0.22); border: 2px dashed #bae6fd; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 13px; }

      .tm-skill-bar { margin-top: 6px; display: flex; gap: 6px; align-items: center; }
      .tm-skill-btn { flex: 1; position: relative; overflow: hidden; border: 1.5px solid rgba(192, 132, 252, 0.55); background: rgba(30, 27, 75, 0.9); color: #e2e8f0; border-radius: 12px; padding: 9px 10px; font-size: 11.5px; font-weight: 900; cursor: pointer; }
      .tm-skill-btn.is-ready { border-color: #facc15; color: #0b1120; background: linear-gradient(135deg, #facc15, #f59e0b); box-shadow: 0 0 18px rgba(250, 204, 21, 0.6); animation: tmPulseWarn 0.75s ease-in-out infinite alternate; }
      .tm-skill-fill { position: absolute; top: 0; right: 0; bottom: 0; width: 0%; background: rgba(168, 85, 247, 0.35); pointer-events: none; transition: width 0.2s ease; }
      .tm-skill-txt { position: relative; z-index: 2; }
      .tm-shuffle-btn { padding: 9px 11px; border-radius: 12px; border: 1.5px solid rgba(56,189,248,0.55); background: rgba(14,116,144,0.3); color: #bae6fd; font-size: 11px; font-weight: 800; cursor: pointer; white-space: nowrap; }
      .tm-shuffle-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .tm-modal-backdrop { position: absolute; inset: 0; z-index: 25; background: rgba(5, 8, 17, 0.88); backdrop-filter: blur(5px); display: none; align-items: center; justify-content: center; padding: 16px; }
      .tm-modal-card { width: 100%; max-width: 360px; background: #151f32; border: 2px solid #d4af37; border-radius: 18px; padding: 16px; text-align: center; box-shadow: 0 14px 36px rgba(0,0,0,0.65); }
      .tm-modal-title { font-size: 16.5px; font-weight: 900; color: #facc15; margin-bottom: 8px; }
      .tm-modal-sub { font-size: 12px; color: #cbd5e1; line-height: 1.6; margin-bottom: 10px; }
      .tm-modal-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
      .tm-stat-box { background: #0b1120; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 7px; }
      .tm-stat-val { font-size: 15px; font-weight: 900; color: #4ade80; }
      .tm-stat-lbl { font-size: 10px; color: #94a3b8; }
      .tm-perk-btn { width: 100%; text-align: right; background: #0b1120; border: 1.5px solid rgba(212,175,55,0.45); border-radius: 10px; padding: 8px 10px; color: #f8fafc; margin-bottom: 6px; cursor: pointer; }
      .tm-perk-btn:hover { border-color: #facc15; background: #1e293b; }
      .tm-btn { width: 100%; padding: 10px; border-radius: 10px; border: none; font-size: 12.5px; font-weight: 900; cursor: pointer; margin-top: 6px; }
      .tm-btn-gold { background: linear-gradient(135deg, #facc15, #d4af37); color: #0b1120; }
      .tm-btn-green { background: #16a34a; color: #fff; }
      .tm-btn-outline { background: transparent; border: 1px solid #64748b; color: #cbd5e1; }

      @keyframes tmPulseWarn { from { transform: scale(1); } to { transform: scale(1.025); } }
      @keyframes tmPulseHint { from { filter: brightness(1); } to { filter: brightness(1.3); } }
      @keyframes tmFloatUp { 0% { opacity: 1; transform: translate(-50%, -15%) scale(0.9); } 100% { opacity: 0; transform: translate(-50%, -145%) scale(1.15); } }
      @keyframes tmScreenShake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-4px, 3px); } 50% { transform: translate(4px, -3px); } 75% { transform: translate(-3px, -2px); } }
      @keyframes tmTowerClimb { 0% { transform: translateY(18px); opacity: 0.4; } 100% { transform: translateY(0); opacity: 1; } }
      @keyframes tmShock { from { transform: scale(0.85); opacity: 0.9; } to { transform: scale(1.06); opacity: 0; } }
    `;
    document.head.appendChild(st);
  }

  // --------------------------------------------------------------------------
  // طبقة جزيئات Canvas الخفيفة
  // --------------------------------------------------------------------------
  let particles = [], particleRaf = null;
  function spawnParticles(count = 14, color = "#facc15") {
    const cvs = document.getElementById("tmParticleCanvas");
    if (!cvs) return;
    if (cvs.width !== cvs.clientWidth) { cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight; }
    const cx = cvs.width / 2, cy = cvs.height / 2;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 1.5 + Math.random() * 4.2;
      particles.push({
        x: cx + (Math.random() - 0.5) * cvs.width * 0.6,
        y: cy + (Math.random() - 0.5) * cvs.height * 0.6,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
        life: 1, color, size: 2.5 + Math.random() * 3.5
      });
    }
    if (!particleRaf) runParticles();
  }

  function runParticles() {
    const cvs = document.getElementById("tmParticleCanvas");
    if (!cvs || !particles.length) { particleRaf = null; return; }
    const ctx = cvs.getContext("2d");
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    particles = particles.filter((p) => p.life > 0.04);
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life -= 0.045;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    particleRaf = requestAnimationFrame(runParticles);
  }

  function launchProjectile(fromEl, toEl, color = "#ef4444") {
    if (!fromEl || !toEl) return;
    const r1 = fromEl.getBoundingClientRect(), r2 = toEl.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "tm-proj";
    dot.style.background = color;
    dot.style.boxShadow = `0 0 12px ${color}`;
    dot.style.left = `${r1.left + r1.width / 2}px`;
    dot.style.top = `${r1.top + r1.height / 2}px`;
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = `translate3d(${r2.left + r2.width / 2 - (r1.left + r1.width / 2)}px, ${r2.top + r2.height / 2 - (r1.top + r1.height / 2)}px, 0) scale(1.5)`;
      dot.style.opacity = "0";
    });
    setTimeout(() => dot.remove(), 360);
  }

  let engine = null, onCompleteCb = null, selectedCell = null, hintPair = null;
  let pointerStart = null, lastWarnSec = -1, idleHintTimer = null;
  let isAnimating = false, bufferedMove = null;
  const tileDomMap = new Map();

  function resetIdleHintTimer() {
    clearTimeout(idleHintTimer);
    if (!engine || engine.status !== "playing") return;
    idleHintTimer = setTimeout(() => {
      if (!engine || engine.status !== "playing" || isAnimating) return;
      hintPair = engine.board.findBestHint();
      if (hintPair) renderBoard(engine.board.getSnapshot());
    }, 3500);
  }

  function triggerShockwave() {
    const wrap = document.querySelector(".tm-board-box");
    const ov = document.getElementById("moaathTowerOverlay");
    if (ov) { ov.classList.add("is-shake-screen"); setTimeout(() => ov.classList.remove("is-shake-screen"), 300); }
    if (wrap) { const sw = document.createElement("div"); sw.className = "tm-shockwave"; wrap.appendChild(sw); setTimeout(() => sw.remove(), 430); }
    spawnParticles(18, "#facc15");
  }

  // إيقاف مؤقت تلقائي عند الخروج لواتساب (visibilitychange)
  function onVisibilityChange() {
    if (!engine) return;
    if (document.hidden && engine.status === "playing") {
      engine.pause();
      SFX.stopBeat();
      const pm = document.getElementById("tmPauseModal");
      if (pm) pm.style.display = "flex";
    }
  }

  function ensureDOM() {
    if (document.getElementById("moaathTowerOverlay")) return document.getElementById("moaathTowerOverlay");
    injectStyles();
    const ov = document.createElement("div");
    ov.id = "moaathTowerOverlay";
    ov.innerHTML = `
      <div class="tm-shell">
        <div class="tm-hud">
          <div style="display:flex; gap:4px; align-items:center;">
            <span id="tmFloorPill" class="tm-pill tm-pill-gold">🏰 الطابق 1</span>
            <span id="tmScorePill" class="tm-pill">🪙 0</span>
            <span id="tmMultPill" class="tm-pill" style="color:#4ade80;">×1.0</span>
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            <button type="button" id="tmPauseBtn" class="tm-pill tm-pill-btn" title="إيقاف مؤقت">⏸️</button>
            <button type="button" id="tmQuestsBtn" class="tm-pill tm-pill-btn" title="مهام البرج اليومية">📋</button>
            <button type="button" id="tmMuteBtn" class="tm-pill tm-pill-btn">🔊</button>
            <button type="button" id="tmExitBtn" class="tm-pill tm-pill-exit">انسحاب</button>
          </div>
        </div>

        <div id="tmMapRow" class="tm-map-row"></div>

        <div class="tm-timer-wrap">
          <div id="tmTimerFill" class="tm-timer-fill"></div>
          <div id="tmTimerLabel" class="tm-timer-label">⏱️ 35.0 ثانية</div>
        </div>

        <div id="tmBuffsRow" class="tm-buffs-row"></div>
        <div id="tmGhostBar" class="tm-ghost-bar">
          <span>👻 هدف المنافس: <strong id="tmGhostTarget">0</strong></span>
          <span id="tmGhostStatus">متقارب</span>
        </div>

        <div id="tmStage" class="tm-stage">
          <div class="tm-arena-row">
            <div class="tm-fighter">
              <img id="tmHeroImg" class="tm-avatar" src="./assets/chars/buddy.jpg" alt="بطل">
              <div id="tmHeroName" class="tm-fighter-name">بندق الودود</div>
            </div>
            <div class="tm-center-col">
              <div id="tmBossTitle" style="font-size:10.5px; font-weight:900; color:#facc15; text-align:center;">حارس الطابق</div>
              <div class="tm-hp-wrap">
                <div id="tmHpFill" class="tm-hp-fill"></div>
                <div id="tmHpText" class="tm-hp-text">100 / 100</div>
              </div>
              <div id="tmComboBadge" class="tm-combo-badge"></div>
            </div>
            <div class="tm-fighter">
              <img id="tmBossImg" class="tm-avatar" src="./assets/tower_match/boss_1_bronze.png" alt="زعيم">
              <div id="tmBossTag" class="tm-fighter-name">حارس البرج</div>
              <div id="tmBossAtkBar" class="tm-boss-atk-bar"><div id="tmBossAtkFill" class="tm-boss-atk-fill"></div></div>
            </div>
          </div>
        </div>

        <div class="tm-board-wrap">
          <div class="tm-board-box">
            <div id="tmBoard" class="tm-board-layer"></div>
            <canvas id="tmParticleCanvas"></canvas>
          </div>
        </div>

        <div class="tm-skill-bar">
          <button type="button" id="tmSkillBtn" class="tm-skill-btn">
            <div id="tmSkillFill" class="tm-skill-fill"></div>
            <span id="tmSkillTxt" class="tm-skill-txt">⭐ شحن المهارة: 0%</span>
          </button>
          <button type="button" id="tmShuffleBtn" class="tm-shuffle-btn">🔀 خلط (1)</button>
        </div>
      </div>

      <!-- نافذة الإيقاف المؤقت (لحماية اللعب عند الرد على واتساب) -->
      <div id="tmPauseModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div class="tm-modal-title">⏸️ اللعبة متوقفة مؤقتاً</div>
          <div class="tm-modal-sub">تم تجميد العداد بأمان لحفظ وقتك ونقاطك.</div>
          <button type="button" id="tmResumeBtn" class="tm-btn tm-btn-gold">▶️ متابعة الصعود</button>
          <button type="button" id="tmPauseRetreatBtn" class="tm-btn tm-btn-outline">🛡️ انسحاب آمن وحفظ النقاط</button>
        </div>
      </div>

      <!-- دليل أول جولة -->
      <div id="tmTutorialModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div class="tm-modal-title">🏰 برج التحدي اللانهائي v3.0!</div>
          <div class="tm-modal-sub" style="text-align:right;">
            1️⃣ <b>طابق 3+ قطع:</b> السيوف ⚔️ تضرب الحارس، والساعات ⏱️ تمدّد وقتك.<br>
            2️⃣ <b>القطع الخارقة:</b> 4 قطع = مدفع، L/T = قنبلة، 5 = جوهرة الطيف (بدّلها أو انقر مرتين!).<br>
            3️⃣ <b>حماس وتكتيك:</b> 3 مطابقات سريعة تشعل <b>الحماس ×1.5 ← ×2.0</b>، والكومبو ×3 يذهل الزعيم!
          </div>
          <button type="button" id="tmTutStartBtn" class="tm-btn tm-btn-gold">🚀 فهمت، لنبدأ الصعود!</button>
        </div>
      </div>

      <!-- نافذة مهام البرج اليومية -->
      <div id="tmQuestsModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div class="tm-modal-title">📋 مهام البرج اليومية</div>
          <div id="tmQuestsList" class="tm-modal-sub" style="text-align:right;"></div>
          <button type="button" class="tm-btn tm-btn-gold" onclick="document.getElementById('tmQuestsModal').style.display='none'">إغلاق</button>
        </div>
      </div>

      <!-- نافذة قرار الزعيم + اختيار بركة Roguelike -->
      <div id="tmBossModal" class="tm-modal-backdrop">
        <div class="tm-modal-card">
          <div class="tm-modal-title">👑 هزمت زعيم الطابق!</div>
          <div id="tmBossModalSub" class="tm-modal-sub"></div>
          <div id="tmPerksBox" style="margin-bottom:8px;"></div>
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
          <button type="button" id="tmShareWaBtn" class="tm-btn tm-btn-green">📲 شارك نتيجتك عبر واتساب</button>
          <button type="button" id="tmFinishCloseBtn" class="tm-btn tm-btn-gold">✅ اعتماد النتيجة والعودة</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    document.getElementById("tmMuteBtn").onclick = () => {
      SFX.muted = !SFX.muted;
      document.getElementById("tmMuteBtn").textContent = SFX.muted ? "🔇" : "🔊";
      if (SFX.muted) SFX.stopBeat();
    };
    document.getElementById("tmPauseBtn").onclick = () => {
      if (engine && engine.status === "playing") {
        engine.pause();
        SFX.stopBeat();
        document.getElementById("tmPauseModal").style.display = "flex";
      }
    };
    document.getElementById("tmResumeBtn").onclick = () => {
      document.getElementById("tmPauseModal").style.display = "none";
      if (engine && engine.status === "paused") {
        engine.resume();
        resetIdleHintTimer();
      }
    };
    document.getElementById("tmPauseRetreatBtn").onclick = () => {
      document.getElementById("tmPauseModal").style.display = "none";
      if (engine) engine.retreatSafely();
    };
    document.getElementById("tmQuestsBtn").onclick = () => {
      const qData = window.MoaathTowerEngine.loadDailyQuests();
      document.getElementById("tmQuestsList").innerHTML = qData.quests.map((q) => `
        <div style="background:#0b1120; border:1px solid ${q.done ? '#22c55e' : 'rgba(255,255,255,0.12)'}; border-radius:10px; padding:8px; margin-bottom:6px;">
          <div style="font-weight:800; color:${q.done ? '#4ade80' : '#f8fafc'};">${q.done ? '✅' : '🎯'} ${esc(q.title)}</div>
          <div style="font-size:10.5px; color:#94a3b8;">التقدم: ${q.progress}/${q.target} • المكافأة: +${q.rewardXp} XP</div>
        </div>
      `).join("");
      document.getElementById("tmQuestsModal").style.display = "flex";
    };
    document.getElementById("tmExitBtn").onclick = () => {
      if (!engine || engine.status === "ended") return closeUI();
      if (engine.mode === "practice" || confirm("هل تريد الانسحاب وحفظ نقاطك الحالية؟")) engine.retreatSafely();
    };
    document.getElementById("tmSkillBtn").onclick = () => { if (engine && !isAnimating) engine.activateSkill(); };
    document.getElementById("tmShuffleBtn").onclick = () => { if (engine && !isAnimating) engine.useEmergencyShuffle(); };
    document.getElementById("tmRetreatBtn").onclick = () => {
      document.getElementById("tmBossModal").style.display = "none";
      if (engine) engine.retreatSafely();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
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
    setTimeout(() => el.remove(), 800);
  }

  function renderMiniMap(floorNum) {
    const row = document.getElementById("tmMapRow");
    if (!row) return;
    const posInCycle = ((floorNum - 1) % 5) + 1;
    let html = "";
    for (let i = 1; i <= 4; i++) {
      html += `<span class="tm-map-dot ${i < posInCycle ? 'is-done' : (i === posInCycle ? 'is-now' : '')}"></span>`;
    }
    html += `<span class="tm-map-boss ${posInCycle === 5 ? 'is-now' : ''}">👑</span>`;
    row.innerHTML = html;
  }

  // --------------------------------------------------------------------------
  // رسم القطع الدائم 60fps عبر translate3d (بدون إعادة بناء innerHTML)
  // --------------------------------------------------------------------------
  function getTileMetrics(boardEl, rows, cols) {
    const w = boardEl.clientWidth || 360;
    const gap = 5;
    const cellW = (w - gap * (cols - 1)) / cols;
    return { cellW, gap };
  }

  function renderBoard(snapshot, animateNewFromTop = true) {
    const boardEl = document.getElementById("tmBoard");
    if (!boardEl || !snapshot) return;
    const rows = snapshot.length, cols = snapshot[0].length;
    const { cellW, gap } = getTileMetrics(boardEl, rows, cols);
    const assets = window.MoaathTowerAssets;
    const activeUids = new Set();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = snapshot[r][c];
        if (!cell) continue;
        activeUids.add(cell.uid);

        let el = tileDomMap.get(cell.uid);
        const targetX = c * (cellW + gap);
        const targetY = r * (cellW + gap);
        const isNew = !el;

        if (!el) {
          el = document.createElement("div");
          el.className = "tm-tile";
          el.style.width = `${cellW}px`;
          el.style.height = `${cellW}px`;
          if (animateNewFromTop) {
            el.style.transform = `translate3d(${targetX}px, ${-cellW}px, 0)`;
          } else {
            el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
          }
          boardEl.appendChild(el);
          tileDomMap.set(cell.uid, el);
        } else {
          el.style.width = `${cellW}px`;
          el.style.height = `${cellW}px`;
        }

        el.dataset.r = r;
        el.dataset.c = c;
        el.dataset.uid = cell.uid;

        const isSel = selectedCell && selectedCell.r === r && selectedCell.c === c;
        const isHint = hintPair && ((hintPair.r1 === r && hintPair.c1 === c) || (hintPair.r2 === r && hintPair.c2 === c));
        el.className = [
          "tm-tile",
          isSel ? "is-selected" : "",
          isHint ? "is-hint" : "",
          cell.special === "col_blast" ? "is-col-blast" : "",
          cell.golden ? "is-golden" : "",
          cell.wildcard ? "is-wildcard" : "",
          cell.barrel ? "is-barrel" : "",
          cell.chest ? "is-chest" : "",
          cell.stone ? "is-stone" : "",
          cell.locked > 0 ? "is-locked" : "",
          cell.ice >= 2 ? "is-ice-2" : (cell.ice === 1 ? "is-ice-1" : "")
        ].filter(Boolean).join(" ");

        let imgSrc = "";
        if (!cell.wildcard && !cell.barrel && !cell.chest && !cell.stone && assets) {
          if (cell.special === "col_blast" && assets.SPECIAL_DEFS.row_blast) imgSrc = assets.SPECIAL_DEFS.row_blast.src;
          else if (cell.special && assets.SPECIAL_DEFS[cell.special]) imgSrc = assets.SPECIAL_DEFS[cell.special].src;
          else if (assets.TILE_DEFS[cell.type]) imgSrc = assets.TILE_DEFS[cell.type].src;
        }

        if (imgSrc) {
          let img = el.querySelector("img");
          if (!img) { img = document.createElement("img"); el.appendChild(img); }
          if (img.getAttribute("src") !== imgSrc) img.src = imgSrc;
        } else {
          el.innerHTML = "";
        }

        if (isNew && animateNewFromTop) {
          requestAnimationFrame(() => {
            el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
          });
        } else {
          el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
        }
      }
    }

    // إزالة القطع المتفجرة مع أنيميشن Pop & Shatter
    for (const [uid, el] of tileDomMap.entries()) {
      if (!activeUids.has(uid)) {
        tileDomMap.delete(uid);
        el.classList.add("is-popping");
        setTimeout(() => el.remove(), 170);
      }
    }
  }

  function playMoveSteps(mv) {
    if (!mv.steps || mv.steps.length <= 1) {
      renderBoard(mv.boardAfter);
      return;
    }
    isAnimating = true;
    let idx = 0;
    const nextStep = () => {
      if (idx >= mv.steps.length) {
        renderBoard(mv.boardAfter);
        isAnimating = false;
        if (bufferedMove && engine && engine.status === "playing") {
          const bm = bufferedMove;
          bufferedMove = null;
          engine.performSwap(bm.r1, bm.c1, bm.r2, bm.c2);
        }
        return;
      }
      const st = mv.steps[idx];
      if (idx > 0) {
        SFX.match(st.comboLevel);
        spawnFloatText(`🔥 كومبو ×${st.comboLevel}!`, "#facc15");
      }
      if (st.boardAfter) renderBoard(st.boardAfter);
      idx++;
      setTimeout(nextStep, 190);
    };
    nextStep();
  }

  function updateHUD(st) {
    if (!st) return;
    document.getElementById("tmFloorPill").textContent = st.isBossFloor ? `👑 زعيم ط${st.floor}` : `🏰 الطابق ${st.floor}`;
    document.getElementById("tmScorePill").textContent = `🪙 ${st.score.toLocaleString()}`;
    document.getElementById("tmMultPill").textContent = `×${st.riskMultiplier.toFixed(2)}`;
    renderMiniMap(st.floor);

    // تبدّل بيئة البرج حسب الزعيم كل 5 طوابق
    const ov = document.getElementById("moaathTowerOverlay");
    if (ov && st.bossTheme?.bgTop && st.bossTheme?.bgBot) {
      ov.style.background = `radial-gradient(circle at 50% 18%, ${st.bossTheme.bgBot} 0%, ${st.bossTheme.bgTop} 70%, #050811 100%)`;
    }

    const stage = document.getElementById("tmStage");
    stage.classList.toggle("is-boss", !!st.isBossFloor);

    const hpPct = Math.max(0, Math.min(100, (st.guardianHp / Math.max(1, st.guardianMaxHp)) * 100));
    document.getElementById("tmHpFill").style.width = `${hpPct}%`;
    document.getElementById("tmHpText").textContent = `${st.guardianHp} / ${st.guardianMaxHp}`;

    document.getElementById("tmBossTitle").textContent = st.isBossFloor ? `👑 ${st.bossTheme?.name || "زعيم البرج"}` : `حارس الطابق ${st.floor}`;
    document.getElementById("tmBossTag").textContent = st.isBossFloor ? "زعيم البرج" : `المستوى ${st.floor}`;
    if (st.bossTheme?.src) {
      const bImg = document.getElementById("tmBossImg");
      if (bImg.getAttribute("src") !== st.bossTheme.src) bImg.src = st.bossTheme.src;
    }

    const buffs = [];
    if (st.mode === "practice") buffs.push("🎓 تدريب مجاني");
    if (st.mode === "daily_boss") buffs.push("📅 الزعيم اليومي");
    if (st.mode === "hardcore") buffs.push("💀 النخبة الصعب");
    if (st.feverTier === 2) buffs.push(`💥 انفجار أقصى ×2.0 (${st.feverLeftSec}ث)`);
    else if (st.feverTier === 1) buffs.push(`🔥 حماس ذهبي ×1.5 (${st.feverLeftSec}ث)`);
    if (st.freezeLeftSec > 0) buffs.push(`❄️ مجمد (${st.freezeLeftSec}ث)`);
    if (st.floorModifier) buffs.push(st.floorModifier.label);
    if (st.miniObjective && !st.miniObjective.done) buffs.push(`🎯 ${st.miniObjective.label} (${st.miniObjective.progress}/${st.miniObjective.target})`);
    document.getElementById("tmBuffsRow").innerHTML = buffs.map((b) => `<span class="tm-buff-chip">${b}</span>`).join("");

    const ghostBar = document.getElementById("tmGhostBar");
    if (st.opponentTargetScore > 0) {
      ghostBar.style.display = "flex";
      document.getElementById("tmGhostTarget").textContent = st.opponentTargetScore.toLocaleString();
      const diff = st.score - st.opponentTargetScore;
      document.getElementById("tmGhostStatus").textContent = diff >= 0 ? `✅ متقدم +${diff}` : `⚔️ متبقٍ ${Math.abs(diff)}`;
    } else {
      ghostBar.style.display = "none";
    }

    const skBtn = document.getElementById("tmSkillBtn");
    const ready = st.skillCharge >= 100;
    skBtn.classList.toggle("is-ready", ready);
    document.getElementById("tmSkillFill").style.width = `${st.skillCharge}%`;
    document.getElementById("tmSkillTxt").textContent = ready
      ? `⚡ فعّل «${st.persona?.skillName || "المهارة"}» الآن!`
      : `⭐ ${st.persona?.skillName || "المهارة"}: ${st.skillCharge}%`;

    const shBtn = document.getElementById("tmShuffleBtn");
    shBtn.disabled = st.emergencyShufflesLeft <= 0;
    shBtn.textContent = `🔀 خلط (${st.emergencyShufflesLeft})`;

    updateTimerBar(st.timeLeftSec, st.maxTimeSec, st.freezeLeftSec, st.feverTier, st.isBossFloor, st.bossAttackCooldownSec, st.bossAttackMaxSec);
  }

  function updateTimerBar(timeLeftSec, maxTimeSec, freezeLeftSec, feverTier = 0, isBoss = false, bossCd = 12, bossMax = 12) {
    const fill = document.getElementById("tmTimerFill");
    const lbl = document.getElementById("tmTimerLabel");
    const ov = document.getElementById("moaathTowerOverlay");
    if (ov) {
      ov.classList.toggle("is-fever", feverTier === 1);
      ov.classList.toggle("is-overdrive", feverTier === 2);
      ov.classList.toggle("is-last-stand", freezeLeftSec <= 0 && timeLeftSec <= 5 && timeLeftSec > 0);
    }
    if (fill && lbl) {
      const pct = Math.max(0, Math.min(100, (timeLeftSec / Math.max(1, maxTimeSec)) * 100));
      fill.style.width = `${pct}%`;
      fill.classList.toggle("is-frozen", freezeLeftSec > 0);
      fill.classList.toggle("is-warn", freezeLeftSec <= 0 && timeLeftSec <= 7);
      lbl.textContent = freezeLeftSec > 0
        ? `❄️ مجمد (${freezeLeftSec.toFixed(1)}ث) — ⏱️ ${timeLeftSec.toFixed(1)}ث`
        : `⏱️ ${timeLeftSec.toFixed(1)} ثانية`;
    }
    const atkBar = document.getElementById("tmBossAtkBar");
    const atkFill = document.getElementById("tmBossAtkFill");
    if (atkBar && atkFill) {
      atkBar.style.display = isBoss ? "block" : "none";
      if (isBoss) {
        const chargePct = Math.max(0, Math.min(100, ((bossMax - bossCd) / Math.max(1, bossMax)) * 100));
        atkFill.style.width = `${chargePct}%`;
        atkFill.classList.toggle("is-danger", bossCd <= 3.5);
      }
    }
  }

  function bindBoardInput() {
    const boardEl = document.getElementById("tmBoard");
    if (!boardEl) return;
    const getTile = (ev) => {
      const t = ev.target.closest(".tm-tile");
      return t ? { el: t, r: parseInt(t.dataset.r, 10), c: parseInt(t.dataset.c, 10) } : null;
    };

    boardEl.addEventListener("pointerdown", (ev) => {
      if (!engine || engine.status !== "playing") return;
      const cell = getTile(ev);
      if (!cell) return;
      pointerStart = { ...cell, x: ev.clientX, y: ev.clientY, swiped: false };
    });

    boardEl.addEventListener("pointermove", (ev) => {
      if (!pointerStart || pointerStart.swiped || !engine || engine.status !== "playing") return;
      const dx = ev.clientX - pointerStart.x, dy = ev.clientY - pointerStart.y;
      const dist = Math.hypot(dx, dy);

      // سحب حيّ يتبع الإصبع قبل إطلاق التبديل
      if (dist > 4 && dist < 24 && !isAnimating) {
        const clampX = Math.max(-14, Math.min(14, dx));
        const clampY = Math.max(-14, Math.min(14, dy));
        const { cellW, gap } = getTileMetrics(boardEl, engine.board.rows, engine.board.cols);
        pointerStart.el.classList.add("is-dragging");
        pointerStart.el.style.transform = `translate3d(${pointerStart.c * (cellW + gap) + clampX}px, ${pointerStart.r * (cellW + gap) + clampY}px, 0) scale(1.06)`;
      }

      if (dist < 22) return;
      pointerStart.el.classList.remove("is-dragging");
      pointerStart.swiped = true;
      let nr = pointerStart.r, nc = pointerStart.c;
      if (Math.abs(dx) > Math.abs(dy)) nc += dx > 0 ? 1 : -1;
      else nr += dy > 0 ? 1 : -1;

      selectedCell = null; hintPair = null;
      if (isAnimating) {
        bufferedMove = { r1: pointerStart.r, c1: pointerStart.c, r2: nr, c2: nc };
      } else {
        engine.performSwap(pointerStart.r, pointerStart.c, nr, nc);
      }
      resetIdleHintTimer();
    });

    boardEl.addEventListener("pointerup", () => {
      if (!pointerStart) return;
      pointerStart.el.classList.remove("is-dragging");
      const wasSwiped = pointerStart.swiped;
      const startCell = { r: pointerStart.r, c: pointerStart.c };
      pointerStart = null;
      if (wasSwiped || !engine || engine.status !== "playing" || isAnimating) return;

      if (!selectedCell) {
        selectedCell = startCell;
        renderBoard(engine.board.getSnapshot());
        return;
      }
      if (selectedCell.r === startCell.r && selectedCell.c === startCell.c) {
        const tappedTile = engine.board.grid[startCell.r]?.[startCell.c];
        selectedCell = null;
        if (tappedTile && tappedTile.special && tappedTile.locked === 0) {
          hintPair = null;
          engine.triggerSpecialTile(startCell.r, startCell.c);
          resetIdleHintTimer();
          return;
        }
        renderBoard(engine.board.getSnapshot());
        return;
      }
      if (engine.board.isAdjacent(selectedCell.r, selectedCell.c, startCell.r, startCell.c)) {
        const prev = selectedCell;
        selectedCell = null; hintPair = null;
        engine.performSwap(prev.r, prev.c, startCell.r, startCell.c);
        resetIdleHintTimer();
      } else {
        selectedCell = startCell;
        renderBoard(engine.board.getSnapshot());
      }
    });
  }

  function closeUI() {
    clearTimeout(idleHintTimer);
    SFX.stopBeat();
    isAnimating = false;
    bufferedMove = null;
    tileDomMap.clear();
    const boardEl = document.getElementById("tmBoard");
    if (boardEl) boardEl.innerHTML = "";
    if (engine) { engine.destroy(); engine = null; }
    const ov = document.getElementById("moaathTowerOverlay");
    if (ov) { ov.style.display = "none"; ov.classList.remove("is-fever", "is-overdrive", "is-last-stand"); }
  }

  function launch(options = {}) {
    if (!window.MoaathTowerEngine || !window.MoaathTowerBoard) {
      alert("⚠️ يرجى التأكد من تحميل ملفات tower_board.js و tower_engine.js");
      return;
    }

    const ov = ensureDOM();
    ov.style.display = "flex";
    ["tmBossModal", "tmEndModal", "tmQuestsModal", "tmPauseModal"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.style.display = "none";
    });

    tileDomMap.clear();
    document.getElementById("tmBoard").innerHTML = "";
    onCompleteCb = typeof options.onComplete === "function" ? options.onComplete : null;
    selectedCell = null; hintPair = null; lastWarnSec = -1; isAnimating = false; bufferedMove = null;

    if (engine) engine.destroy();
    engine = new window.MoaathTowerEngine.TowerEngine({
      mode: options.mode || "record",
      seed: options.seed,
      sessionId: options.sessionId || null,
      personaId: options.personaId || "buddy",
      activeItem: options.activeItem || null,
      opponentTargetScore: options.opponentTargetScore || 0
    });

    const pId = engine.personaId;
    const heroImg = document.getElementById("tmHeroImg");
    heroImg.src = CHAR_IMG_MAP[pId] || `./assets/chars/${pId}.jpg`;
    heroImg.onerror = () => { heroImg.src = "./assets/chars/buddy.jpg"; };
    document.getElementById("tmHeroName").textContent = engine.persona.name;

    engine.on("tick", (t) => updateTimerBar(t.timeLeftSec, t.maxTimeSec, t.freezeLeftSec, t.feverTier, t.isBossFloor, t.bossAttackCooldownSec, t.bossAttackMaxSec));
    engine.on("timeWarning", ({ timeLeftSec }) => {
      const s = Math.ceil(timeLeftSec);
      if (s !== lastWarnSec && s > 0) { lastWarnSec = s; SFX.heartbeat(); }
    });
    engine.on("invalidSwap", () => { SFX.invalid(); renderBoard(engine.board.getSnapshot()); });
    engine.on("feverStart", ({ tier, mult }) => {
      SFX.fever();
      SFX.startBeat(true);
      spawnFloatText(tier === 2 ? `💥 انفجار أقصى ×${mult}!` : `🔥 حماس ذهبي ×${mult}!`, "#facc15");
    });
    engine.on("chestSpawned", (cs) => {
      spawnFloatText("🎁 صندوق غنيمة (5ث)!", "#fde047");
      renderBoard(cs.boardAfter);
    });
    engine.on("chestExpired", (ce) => renderBoard(ce.boardAfter));
    engine.on("bossAttack", (ba) => {
      SFX.invalid(); triggerShockwave();
      spawnFloatText(ba.label, "#f87171");
      renderBoard(ba.boardAfter); updateHUD(ba.state);
    });
    engine.on("questDone", (qs) => qs.forEach((q) => spawnFloatText(`✅ مهمة يومية: ${q.title}`, "#4ade80")));
    engine.on("shuffled", (sh) => {
      SFX.skill(); spawnFloatText("🔀 تم خلط اللوحة!", "#7dd3fc");
      renderBoard(sh.boardAfter); updateHUD(sh.state); resetIdleHintTimer();
    });

    engine.on("move", (mv) => {
      if (mv.totals.specialsTriggered > 0) { SFX.special(); triggerShockwave(); }
      else SFX.match(mv.totals.maxCombo);

      const boardEl = document.getElementById("tmBoard");
      const bImg = document.getElementById("tmBossImg");
      const hImg = document.getElementById("tmHeroImg");
      hImg.classList.add("is-attack"); bImg.classList.add("is-hit");
      setTimeout(() => { hImg.classList.remove("is-attack"); bImg.classList.remove("is-hit"); }, 220);

      // مقذوفات طائرة نحو الأهداف
      if (mv.totals.clearedByType.sword > 0) launchProjectile(boardEl, bImg, "#ef4444");
      if (mv.totals.clearedByType.clock > 0) launchProjectile(boardEl, document.getElementById("tmTimerFill"), "#38bdf8");
      if (mv.totals.clearedByType.star > 0) launchProjectile(boardEl, document.getElementById("tmSkillBtn"), "#c084fc");

      let txt = `${mv.isCrit ? '💥 CRIT! ' : ''}-${mv.damage} ⚔️`;
      if (mv.bossStunned) txt = `⚡ إذهال الزعيم! -${mv.damage}`;
      if (mv.addedSec > 0) txt += ` +${mv.addedSec}ث`;
      if (mv.chestsOpened > 0) txt += ` 🎁+250`;
      if (mv.wildcardSpawned) txt += ` 🃏 جوكر!`;
      spawnFloatText(txt, mv.bossStunned || mv.isCrit ? "#facc15" : "#fca5a5");

      if (mv.miniObjCompleted) spawnFloatText("🎯 مهمة الطابق مكتملة! +4ث ومهارة كاملة", "#4ade80");
      if (mv.totals.maxCombo >= 3 && engine.persona?.quote) {
        document.getElementById("tmComboBadge").textContent = `💬 ${engine.persona.quote}`;
      } else {
        document.getElementById("tmComboBadge").textContent = mv.totals.maxCombo >= 2
          ? `🔥 كومبو ×${mv.totals.maxCombo}! (+${mv.gainedScore})`
          : `+${mv.gainedScore} نقطة`;
      }

      playMoveSteps(mv);
      updateHUD(mv.state);
    });

    engine.on("skillReady", () => { SFX.skill(); spawnFloatText("⚡ المهارة جاهزة!", "#facc15"); });
    engine.on("skillUsed", (sk) => {
      SFX.special(); triggerShockwave();
      if (sk.hint) hintPair = sk.hint;
      spawnFloatText(`⚡ ${sk.persona.skillName}!`, "#c084fc");
      renderBoard(sk.boardAfter); updateHUD(sk.state);
    });
    engine.on("floorCleared", (fc) => {
      SFX.floorClear(); triggerShockwave();
      const stage = document.getElementById("tmStage");
      stage.classList.add("is-scroll-up");
      setTimeout(() => stage.classList.remove("is-scroll-up"), 460);
      if (fc.isBossFloor) SFX.startBeat(true);
      spawnFloatText(`🏰 الطابق ${fc.newFloor} (+${fc.timeRefill}ث)`, "#4ade80");
      renderBoard(fc.boardAfter); updateHUD(fc.state);
    });

    engine.on("bossDecision", (bd) => {
      clearTimeout(idleHintTimer);
      SFX.stopBeat();
      SFX.floorClear();
      document.getElementById("tmBossModalSub").innerHTML = `
        هزمت <b>${esc(bd.bossName)}</b> في الطابق <b>${bd.defeatedFloor}</b>!<br>
        نقاطك المضمونة: <b style="color:#4ade80;">${bd.safeScore.toLocaleString()}</b> • المضاعف القادم: <b style="color:#facc15;">×${bd.nextMultiplier}</b><br>
        اختر <b>بركة الجولة</b> للمواصلة أو انسحب بأمان:
      `;
      document.getElementById("tmPerksBox").innerHTML = (bd.perks || []).map((pk) => `
        <button type="button" class="tm-perk-btn" data-perk="${pk.id}">
          <div style="font-weight:900; font-size:12px; color:#facc15;">${esc(pk.title)}</div>
          <div style="font-size:10.5px; color:#94a3b8;">${esc(pk.desc)}</div>
        </button>
      `).join("");
      document.querySelectorAll("#tmPerksBox .tm-perk-btn").forEach((btn) => {
        btn.onclick = () => {
          document.getElementById("tmBossModal").style.display = "none";
          if (engine) { engine.continueClimbing(btn.dataset.perk); resetIdleHintTimer(); }
        };
      });
      document.getElementById("tmBossModal").style.display = "flex";
    });

    engine.on("gameOver", (summary) => {
      clearTimeout(idleHintTimer);
      SFX.stopBeat();
      SFX.gameOver();
      document.getElementById("tmEndTitle").textContent = summary.mode === "practice"
        ? "🎓 انتهت جولة التدريب!"
        : (summary.endReason === "safe_retreat" ? "🛡️ انسحاب آمن ناجح!" : "⏱️ انتهى الوقت!");
      document.getElementById("tmEndScore").textContent = summary.score.toLocaleString();
      document.getElementById("tmEndFloor").textContent = `ط${summary.highestFloor}`;
      document.getElementById("tmEndBosses").textContent = summary.bossesDefeated;
      document.getElementById("tmEndCombo").textContent = `×${Math.max(1, summary.maxCombo)}`;
      document.getElementById("tmEndModal").style.display = "flex";

      document.getElementById("tmShareWaBtn").onclick = () => {
        const shareTxt = encodeURIComponent(
          `🏰 وصلت للطابق ${summary.highestFloor} في «برج التحدي اللانهائي» بعالم تحديات معاذ!\n🪙 النقاط: ${summary.score.toLocaleString()} | 👑 زعماء: ${summary.bossesDefeated} | 🔥 أعلى كومبو: ×${Math.max(1, summary.maxCombo)}\nهل تستطيع كسر رقمي؟`
        );
        window.open(`https://wa.me/?text=${shareTxt}`, "_blank");
      };
      document.getElementById("tmFinishCloseBtn").onclick = () => {
        const cb = onCompleteCb;
        closeUI();
        if (cb && summary.mode !== "practice") cb(summary);
      };
    });

    const startNow = () => {
      const initialState = engine.start();
      renderBoard(engine.board.getSnapshot(), false);
      updateHUD(initialState);
      resetIdleHintTimer();
    };

    let seenTut = false;
    try { seenTut = localStorage.getItem(TUTORIAL_KEY) === "1"; } catch (_) {}
    if (!seenTut) {
      renderBoard(engine.board.getSnapshot(), false);
      updateHUD(engine.getPublicState());
      const tutModal = document.getElementById("tmTutorialModal");
      tutModal.style.display = "flex";
      document.getElementById("tmTutStartBtn").onclick = () => {
        try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch (_) {}
        tutModal.style.display = "none";
        startNow();
      };
    } else {
      startNow();
    }
  }

  window.MoaathTowerUI = { version: "3.0", launch, close: closeUI };
})();
