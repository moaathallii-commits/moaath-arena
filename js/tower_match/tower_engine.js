/**
 * ============================================================================
 * محرك البرج والوقت السريع v2.0 — «برج التحدي اللانهائي»
 * المسار: js/tower_match/tower_engine.js
 * التحديثات في v2.0:
 * - وضع الحماس الذهبي (Fever / Overdrive): 3 مطابقات سريعة خلال 4 ثوانٍ = 6 ثوانٍ ×1.5 ضرر ونقاط
 * - قدرات هجومية خاصة للزعماء كل 12 ثانية (أقفال، قلب قطع، استنزاف وقت، جليد)
 * - قطع «المنتجات الذهبية» من متجر معاذ كل 3 طوابق + عقبات جليدية بعد الطابق 10
 * - خلط طارئ للوحة مرة واحدة بالجولة (Emergency Shuffle)
 * - مهام البرج اليومية (Daily Tower Quests) + طور التدريب المجاني + تحدي الزعيم اليومي
 * - دعم الأدوات التكتيكية للبرج (+10 ثوانٍ، قنبلة بداية، شحن مهارة 50%) + شبح المنافس في PvP
 * ============================================================================
 */
(function () {
  const QUESTS_KEY = "moaath_tower_daily_quests_v1";

  const PERSONA_SKILLS = {
    buddy: { id: "buddy", name: "بندق الودود", tier: "standard", passiveLabel: "+2 ثانية وقت بداية", skillName: "دفعة ترحيبية", skillType: "hint_and_time", passive: { startTimeBonus: 2 }, skillPower: { addSec: 3.5, showHint: true } },
    lolo: { id: "lolo", name: "لولو النشيطة", tier: "standard", passiveLabel: "+8% نقاط إضافية للسرعة", skillName: "ومضة السرعة", skillType: "convert_and_dmg", passive: { scoreMult: 1.08 }, skillPower: { convertTo: "bolt", count: 3, directDmg: 25 } },
    noor: { id: "noor", name: "نور الهادئة", tier: "standard", passiveLabel: "+0.4 ثانية لكل مطابقة ساعة", skillName: "سكينة الزمن", skillType: "freeze_time", passive: { clockBonusSec: 0.4 }, skillPower: { freezeSec: 5, addSec: 2 } },
    chef: { id: "chef", name: "الشيف الماهر", tier: "standard", passiveLabel: "+10% ضرر لسيوف الهجوم", skillName: "وصفة الهجوم", skillType: "convert_and_dmg", passive: { swordDmgMult: 1.10 }, skillPower: { convertTo: "sword", count: 4, directDmg: 20 } },
    pastry: { id: "pastry", name: "صانعة الحلويات", tier: "standard", passiveLabel: "+12% نقاط لعملات معاذ", skillName: "مكافأة الضيافة", skillType: "coin_burst", passive: { coinScoreMult: 1.12 }, skillPower: { bonusScore: 180, addSec: 2 } },
    athlete: { id: "athlete", name: "البطل الرياضي", tier: "standard", passiveLabel: "+15% ضرر عند الكومبو ×2 وأعلى", skillName: "ضربة الاندفاع", skillType: "blast_row", passive: { comboDmgMult: 1.15 }, skillPower: { directDmg: 45 } },
    sheikh: { id: "sheikh", name: "شيخ الشباب", tier: "standard", passiveLabel: "+10% شحن أسرع للمهارة", skillName: "فزعة الساحة", skillType: "blast_row", passive: { skillChargeMult: 1.10 }, skillPower: { directDmg: 40, addSec: 1.5 } },
    saver: { id: "saver", name: "خبير التوفير", tier: "standard", passiveLabel: "حفظ +10% إضافية من النقاط عند انتهاء الوقت", skillName: "صفقة ذكية", skillType: "coin_burst", passive: { safeRetainBonus: 0.10 }, skillPower: { bonusScore: 220 } },
    homemaker: { id: "homemaker", name: "رفيقة المنزل", tier: "standard", passiveLabel: "+12% ضرر ضد الزعماء", skillName: "ترتيب اللوحة", skillType: "convert_and_dmg", passive: { bossDmgMult: 1.12 }, skillPower: { convertTo: "emerald", count: 4, directDmg: 25 } },

    coach_sakhr: { id: "coach_sakhr", name: "كابتن صخر", tier: "vip", passiveLabel: "+18% ضرر ضد الزعماء والطوابق", skillName: "زلزال الصخر", skillType: "blast_row", passive: { swordDmgMult: 1.15, bossDmgMult: 1.18 }, skillPower: { directDmg: 85 } },
    grand_chef: { id: "grand_chef", name: "الشيف الذهبي", tier: "vip", passiveLabel: "+15% ضرر سيوف + 10% نقاط", skillName: "الوليمة الذهبية", skillType: "convert_and_dmg", passive: { swordDmgMult: 1.15, scoreMult: 1.10 }, skillPower: { convertTo: "sword", count: 6, directDmg: 45 } },
    princess_layla: { id: "princess_layla", name: "الأميرة ليلى", tier: "vip", passiveLabel: "+3 ثوانٍ بداية + تجميد أطول", skillName: "هالة الملوك", skillType: "freeze_time", passive: { startTimeBonus: 3, clockBonusSec: 0.6 }, skillPower: { freezeSec: 7, addSec: 3.5 } },
    butler_farid: { id: "butler_farid", name: "السيد فريد", tier: "vip", passiveLabel: "+20% نقاط عملات وحماية المخاطرة", skillName: "خزينة الذهب", skillType: "coin_burst", passive: { coinScoreMult: 1.20, safeRetainBonus: 0.15 }, skillPower: { bonusScore: 340, addSec: 2 } },
    friend_fadi: { id: "friend_fadi", name: "فادي الفرفوش", tier: "vip", passiveLabel: "+20% شحن أسرع للمهارة والكومبو", skillName: "فرفشة الكومبو", skillType: "convert_and_dmg", passive: { skillChargeMult: 1.20, comboDmgMult: 1.15 }, skillPower: { convertTo: "bolt", count: 5, directDmg: 50 } },
    anime_zain: { id: "anime_zain", name: "كابتن زين", tier: "vip", passiveLabel: "+22% ضرر في سلاسل الكومبو السريعة", skillName: "عاصفة النصر", skillType: "blast_row", passive: { comboDmgMult: 1.22, scoreMult: 1.10 }, skillPower: { directDmg: 90 } },
    anime_ryu: { id: "anime_ryu", name: "المحقق ريو", tier: "vip", passiveLabel: "كشف أسرع للحركات + 15% ضرر زمرد", skillName: "بصيرة المحقق", skillType: "hint_and_time", passive: { bossDmgMult: 1.15, scoreMult: 1.08 }, skillPower: { addSec: 5, showHint: true, directDmg: 45 } },
    anime_ritaj: { id: "anime_ritaj", name: "ريتاج", tier: "vip", passiveLabel: "+15% نقاط عامة وحظ مضاعف", skillName: "انفجار البهجة", skillType: "blast_row", passive: { scoreMult: 1.15 }, skillPower: { directDmg: 75, bonusScore: 150 } },
    friend_saad: { id: "friend_saad", name: "الصديق سعد", tier: "vip", passiveLabel: "توازن شامل (+2ث +10% ضرر +10% نقاط)", skillName: "بركة الثبات", skillType: "freeze_time", passive: { startTimeBonus: 2, swordDmgMult: 1.10, scoreMult: 1.10 }, skillPower: { freezeSec: 6, addSec: 3, directDmg: 40 } }
  };

  // --------------------------------------------------------------------------
  // إدارة مهام البرج اليومية (Daily Tower Quests)
  // --------------------------------------------------------------------------
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadDailyQuests() {
    const today = getTodayKey();
    try {
      const saved = JSON.parse(localStorage.getItem(QUESTS_KEY) || "null");
      if (saved && saved.day === today && Array.isArray(saved.quests)) return saved;
    } catch (_) {}
    const fresh = {
      day: today,
      quests: [
        { id: "q_boss", title: "اهزم زعيماً واحداً في البرج", target: 1, progress: 0, rewardXp: 25, done: false },
        { id: "q_spec", title: "فجّر 3 قطع خارقة (قنبلة/مدفع)", target: 3, progress: 0, rewardXp: 20, done: false },
        { id: "q_combo", title: "حقق كومبو ×3 أو أعلى", target: 1, progress: 0, rewardXp: 15, done: false }
      ]
    };
    try { localStorage.setItem(QUESTS_KEY, JSON.stringify(fresh)); } catch (_) {}
    return fresh;
  }

  function updateDailyQuests(delta) {
    const data = loadDailyQuests();
    const newlyCompleted = [];
    data.quests.forEach((q) => {
      if (q.done) return;
      if (q.id === "q_boss" && delta.bosses) q.progress += delta.bosses;
      if (q.id === "q_spec" && delta.specials) q.progress += delta.specials;
      if (q.id === "q_combo" && delta.maxCombo >= 3) q.progress = Math.max(q.progress, 1);
      if (q.progress >= q.target) {
        q.progress = q.target;
        q.done = true;
        newlyCompleted.push(q);
      }
    });
    try { localStorage.setItem(QUESTS_KEY, JSON.stringify(data)); } catch (_) {}
    return { data, newlyCompleted };
  }

  // --------------------------------------------------------------------------
  // كلاس محرك البرج v2.0
  // --------------------------------------------------------------------------
  class TowerEngine {
    constructor(config = {}) {
      if (!window.MoaathTowerBoard) throw new Error("MoaathTowerBoard is required.");

      this.mode = config.mode || "record"; // 'record' | 'pvp' | 'practice' | 'daily_boss'
      this.seed = config.seed || (this.mode === "daily_boss" ? `daily_${getTodayKey()}` : `tower_${Date.now()}`);
      this.sessionId = config.sessionId || null;
      this.personaId = PERSONA_SKILLS[config.personaId] ? config.personaId : "buddy";
      this.persona = PERSONA_SKILLS[this.personaId];
      this.activeItem = config.activeItem || null; // أداة تكتيكية مفعّلة
      this.opponentTargetScore = Number(config.opponentTargetScore || 0); // شبح المنافس في PvP

      this.isBalancedPvp = this.mode === "pvp";
      this.board = new window.MoaathTowerBoard.TowerBoard({
        rows: config.rows || 6,
        cols: config.cols || 6,
        seed: this.seed
      });

      this.listeners = {};
      this._timerId = null;
      this._lastTickMs = 0;
      this.resetState();
    }

    on(eventName, cb) {
      if (!this.listeners[eventName]) this.listeners[eventName] = [];
      this.listeners[eventName].push(cb);
      return () => { this.listeners[eventName] = (this.listeners[eventName] || []).filter((fn) => fn !== cb); };
    }

    _emit(eventName, payload) {
      (this.listeners[eventName] || []).forEach((fn) => { try { fn(payload); } catch (_) {} });
    }

    _effPassive(key, fallback = 1) {
      const raw = this.persona?.passive?.[key];
      if (raw === undefined) return fallback;
      if (!this.isBalancedPvp) return raw;
      return fallback === 1 ? 1 + (raw - 1) * 0.5 : raw * 0.5;
    }

    resetState() {
      this.stopTimer();
      this.status = "idle";
      this.floor = 1;
      this.isBossFloor = false;
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(1)
        : { tier: 1, name: "حارس البوابة البرونزية", accent: "#f59e0b" };

      this.maxTimeSec = 50;
      const startBonus = this._effPassive("startTimeBonus", 0);
      const itemTimeBonus = (this.activeItem === "fuel_boost" || this.activeItem === "tower_time10") ? 10 : 0;
      this.timeLeftSec = Math.min(this.maxTimeSec, 35 + startBonus + itemTimeBonus);
      this.freezeLeftSec = 0;

      // وضع الحماس الذهبي (Fever Mode)
      this.feverLeftSec = 0;
      this._recentMatchTimes = [];

      // هجوم الزعيم كل 12 ثانية
      this.bossAttackCooldownSec = 12;

      // خلط طارئ مرة واحدة في الجولة
      this.emergencyShufflesLeft = 1;

      this.guardianMaxHp = this._calcFloorHp(1);
      this.guardianHp = this.guardianMaxHp;

      this.score = 0;
      this.bankedSafeScore = 0;
      this.riskMultiplier = 1.0;

      this.skillCharge = (this.activeItem === "double_xp" || this.activeItem === "tower_skill50") ? 50 : 0;
      this.maxCombo = 0;
      this.totalMoves = 0;
      this.floorsCleared = 0;
      this.bossesDefeated = 0;
      this.specialsDetonated = 0;
      this.startedAtMs = 0;
      this.elapsedMs = 0;
      this.endReason = null;

      // أداة قنبلة بداية
      if (this.activeItem === "shield_1" || this.activeItem === "tower_bomb") {
        this.board.spawnStartingSpecial("bomb_3x3");
      }
    }

    _calcFloorHp(floorNum) {
      const isBoss = floorNum % 5 === 0;
      const base = 90 + (floorNum - 1) * 28 + Math.floor(Math.pow(floorNum, 1.35) * 6);
      return isBoss ? Math.round(base * 1.65) : base;
    }

    start() {
      this.resetState();
      this.status = "playing";
      this.startedAtMs = Date.now();
      this._lastTickMs = Date.now();
      this._startTimer();
      this._emit("state", this.getPublicState());
      return this.getPublicState();
    }

    _startTimer() {
      this.stopTimer();
      this._lastTickMs = Date.now();
      this._timerId = setInterval(() => this._tick(), 100);
    }

    stopTimer() {
      if (this._timerId !== null) { clearInterval(this._timerId); this._timerId = null; }
    }

    _tick() {
      if (this.status !== "playing") return;
      const now = Date.now();
      const dtSec = Math.min(0.5, Math.max(0.02, (now - this._lastTickMs) / 1000));
      this._lastTickMs = now;
      this.elapsedMs += Math.round(dtSec * 1000);

      if (this.feverLeftSec > 0) {
        this.feverLeftSec = Math.max(0, this.feverLeftSec - dtSec);
      }

      if (this.freezeLeftSec > 0) {
        this.freezeLeftSec = Math.max(0, this.freezeLeftSec - dtSec);
      } else {
        const drainRate = 1 + Math.min(0.45, (this.floor - 1) * 0.02);
        this.timeLeftSec = Math.max(0, this.timeLeftSec - dtSec * drainRate);
      }

      // قدرات الزعماء الهجومية كل 12 ثانية في طابق الزعيم
      if (this.isBossFloor && this.freezeLeftSec <= 0) {
        this.bossAttackCooldownSec -= dtSec;
        if (this.bossAttackCooldownSec <= 0) {
          this.bossAttackCooldownSec = 12;
          this._triggerBossMechanic();
        }
      }

      if (this.timeLeftSec <= 7 && this.timeLeftSec > 0) {
        this._emit("timeWarning", { timeLeftSec: this.timeLeftSec });
      }

      if (this.timeLeftSec <= 0) {
        this._finishGame("timeout");
        return;
      }

      this._emit("tick", {
        timeLeftSec: this.timeLeftSec,
        maxTimeSec: this.maxTimeSec,
        freezeLeftSec: this.freezeLeftSec,
        feverLeftSec: this.feverLeftSec
      });
    }

    _triggerBossMechanic() {
      const tier = this.bossTheme?.tier || 1;
      let label = "";
      if (tier === 1) {
        this.board.applyBossLocks(2);
        label = "🔒 حارس البوابة أقفل قطعتين!";
      } else if (tier === 2) {
        this.board.bossSwapRandomPair();
        label = "🔀 العملاق السيبراني قلب قطعتين!";
      } else if (tier === 3) {
        this.timeLeftSec = Math.max(1, this.timeLeftSec - 2.0);
        label = "🐉 تنين الزمرد استنزف ثانيتين!";
      } else {
        this.board.applyIceObstacles(2, 2);
        label = "❄️ سيد البرج جمّد قطعتين!";
      }
      this._emit("bossAttack", {
        tier,
        label,
        boardAfter: this.board.getSnapshot(),
        state: this.getPublicState()
      });
    }

    _checkFeverActivation() {
      const now = Date.now();
      this._recentMatchTimes.push(now);
      this._recentMatchTimes = this._recentMatchTimes.filter((t) => now - t <= 4200);
      if (this._recentMatchTimes.length >= 3 && this.feverLeftSec <= 0) {
        this.feverLeftSec = 6.0;
        this._recentMatchTimes = [];
        this._emit("feverStart", { durationSec: 6 });
      }
    }

    _applyMoveResult(res) {
      this.totalMoves++;
      const t = res.totals;
      if (t.maxCombo > this.maxCombo) this.maxCombo = t.maxCombo;
      this.specialsDetonated += t.specialsTriggered || 0;
      this._checkFeverActivation();

      const feverMult = this.feverLeftSec > 0 ? 1.5 : 1.0;
      const comboMult = 1 + (Math.max(1, t.maxCombo) - 1) * 0.35;
      const passiveComboMult = t.maxCombo >= 2 ? this._effPassive("comboDmgMult", 1) : 1;
      const swordMult = this._effPassive("swordDmgMult", 1);
      const bossMult = this.isBossFloor ? this._effPassive("bossDmgMult", 1) : 1;
      const scoreMult = this._effPassive("scoreMult", 1);
      const coinMult = this._effPassive("coinScoreMult", 1);
      const chargeMult = this._effPassive("skillChargeMult", 1);
      const clockExtra = this._effPassive("clockBonusSec", 0);

      const byType = t.clearedByType;
      const rawDmg =
        byType.sword * 14 * swordMult +
        byType.bolt * 12 +
        byType.emerald * (this.isBossFloor ? 16 : 10) +
        byType.coin * 4 +
        byType.star * 5 +
        byType.clock * 4 +
        t.specialsTriggered * 30 +
        t.locksBroken * 15 +
        (t.iceBroken || 0) * 14;

      const finalDmg = Math.max(10, Math.round(rawDmg * comboMult * passiveComboMult * bossMult * feverMult));

      let addedSec = 0;
      if (byType.clock > 0) addedSec += byType.clock * (0.9 + clockExtra);
      if (t.maxCombo >= 3) addedSec += 1.2;
      if (addedSec > 0) this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + addedSec);

      const goldenBonus = (t.goldenCollected || 0) * 180;
      const rawScore =
        t.clearedCount * 10 +
        byType.coin * 24 * coinMult +
        t.specialsTriggered * 60 +
        t.locksBroken * 35 +
        (t.iceBroken || 0) * 25 +
        goldenBonus;

      const gainedScore = Math.round(rawScore * comboMult * scoreMult * this.riskMultiplier * feverMult);
      this.score += gainedScore;

      const prevReady = this.skillCharge >= 100;
      const chargeGain = (byType.star * 14 + t.clearedCount * 2.2) * chargeMult;
      this.skillCharge = Math.min(100, Math.round(this.skillCharge + chargeGain));
      if (!prevReady && this.skillCharge >= 100) this._emit("skillReady", { persona: this.persona });

      this.guardianHp = Math.max(0, this.guardianHp - finalDmg);

      // تحديث المهام اليومية
      if (this.mode !== "practice") {
        const qRes = updateDailyQuests({ specials: t.specialsTriggered || 0, maxCombo: t.maxCombo });
        if (qRes.newlyCompleted.length) this._emit("questDone", qRes.newlyCompleted);
      }

      const payload = {
        swap: res.swap,
        steps: res.steps,
        totals: t,
        damage: finalDmg,
        addedSec: Number(addedSec.toFixed(1)),
        gainedScore,
        goldenCollected: t.goldenCollected || 0,
        feverActive: this.feverLeftSec > 0,
        reshuffled: res.reshuffled,
        boardAfter: res.boardAfter,
        state: this.getPublicState()
      };
      this._emit("move", payload);

      if (this.guardianHp <= 0) this._onFloorDefeated();
      return { ...res, effects: { damage: finalDmg, addedSec, gainedScore } };
    }

    performSwap(r1, c1, r2, c2) {
      if (this.status !== "playing") return { valid: false, reason: "not_playing" };
      const res = this.board.trySwap(r1, c1, r2, c2);
      if (!res.valid) {
        this._emit("invalidSwap", { r1, c1, r2, c2, reason: res.reason });
        return res;
      }
      return this._applyMoveResult(res);
    }

    triggerSpecialTile(r, c) {
      if (this.status !== "playing") return { valid: false, reason: "not_playing" };
      const res = this.board.detonateSpecial(r, c);
      if (!res.valid) return res;
      return this._applyMoveResult(res);
    }

    useEmergencyShuffle() {
      if (this.status !== "playing" || this.emergencyShufflesLeft <= 0) return { ok: false };
      this.emergencyShufflesLeft--;
      const snap = this.board.shuffleBoard();
      this._emit("shuffled", { boardAfter: snap, state: this.getPublicState() });
      return { ok: true, boardAfter: snap };
    }

    activateSkill() {
      if (this.status !== "playing" || this.skillCharge < 100) return { ok: false };
      this.skillCharge = 0;
      const p = this.persona;
      const sp = p.skillPower || {};
      let boardUpdate = null, hint = null;
      let directDmg = sp.directDmg || 0, addedSec = sp.addSec || 0, bonusScore = sp.bonusScore || 0;

      if (p.skillType === "blast_row") {
        const res = this.board.skillBlastRow();
        boardUpdate = res.boardAfter;
        directDmg += (res.step.cleared.length || 6) * 8;
      } else if (p.skillType === "convert_and_dmg") {
        boardUpdate = this.board.skillConvertRandomTiles(sp.convertTo || "sword", sp.count || 4).boardAfter;
      } else if (p.skillType === "freeze_time") {
        this.freezeLeftSec = Math.max(this.freezeLeftSec, sp.freezeSec || 5);
      } else if (p.skillType === "hint_and_time") {
        hint = this.board.findBestHint();
      }

      if (addedSec > 0) this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + addedSec);
      if (bonusScore > 0) this.score += Math.round(bonusScore * this.riskMultiplier);
      if (directDmg > 0) this.guardianHp = Math.max(0, this.guardianHp - directDmg);

      const payload = {
        persona: p, directDmg, addedSec, bonusScore, freezeSec: sp.freezeSec || 0, hint,
        boardAfter: boardUpdate || this.board.getSnapshot(), state: this.getPublicState()
      };
      this._emit("skillUsed", payload);
      if (this.guardianHp <= 0) this._onFloorDefeated();
      return { ok: true, ...payload };
    }

    _onFloorDefeated() {
      const wasBoss = this.isBossFloor;
      this.floorsCleared++;
      this.score += Math.round((wasBoss ? 250 : 80) * this.floor * this.riskMultiplier);

      if (wasBoss) {
        this.bossesDefeated++;
        if (this.mode !== "practice") {
          const qRes = updateDailyQuests({ bosses: 1 });
          if (qRes.newlyCompleted.length) this._emit("questDone", qRes.newlyCompleted);
        }
        this.bankedSafeScore = this.score;
        this.status = "boss_decision";
        this.stopTimer();
        this._emit("bossDecision", {
          defeatedFloor: this.floor,
          bossName: this.bossTheme?.name || "زعيم البرج",
          safeScore: this.bankedSafeScore,
          nextMultiplier: Number((this.riskMultiplier + 0.25).toFixed(2)),
          state: this.getPublicState()
        });
        return;
      }
      this._advanceToNextFloor(false);
    }

    continueClimbing() {
      if (this.status !== "boss_decision") return false;
      this.riskMultiplier = Number((this.riskMultiplier + 0.25).toFixed(2));
      this.status = "playing";
      this._advanceToNextFloor(true);
      this._startTimer();
      return true;
    }

    retreatSafely() {
      if (this.status !== "boss_decision" && this.status !== "playing") return false;
      this._finishGame("safe_retreat");
      return true;
    }

    _advanceToNextFloor(afterBoss) {
      this.floor++;
      this.isBossFloor = this.floor % 5 === 0;
      this.bossAttackCooldownSec = 12;
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(this.floor)
        : { tier: 1, name: "حارس البرج", accent: "#f59e0b" };

      this.guardianMaxHp = this._calcFloorHp(this.floor);
      this.guardianHp = this.guardianMaxHp;

      const timeRefill = afterBoss ? 18 : 9;
      this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + timeRefill);

      // قطعة منتج ذهبي من متجر معاذ كل 3 طوابق
      if (this.floor % 3 === 0) this.board.spawnGoldenProductTile();

      // عقبات الجليد المتدرجة بعد الطابق 10
      if (this.floor >= 10 && !this.isBossFloor) {
        this.board.applyIceObstacles(Math.min(4, 1 + Math.floor((this.floor - 10) / 3)), 2);
      }

      let bossLocks = [];
      if (this.isBossFloor) {
        bossLocks = this.board.applyBossLocks(Math.min(5, 2 + Math.floor(this.floor / 5)));
      }

      this._emit("floorCleared", {
        newFloor: this.floor, isBossFloor: this.isBossFloor, bossTheme: this.bossTheme,
        timeRefill, bossLocks, boardAfter: this.board.getSnapshot(), state: this.getPublicState()
      });
    }

    _finishGame(reason) {
      this.stopTimer();
      this.status = "ended";
      this.endReason = reason;
      let finalScore = this.score;
      if (reason === "timeout" && this.bankedSafeScore > 0 && this.score > this.bankedSafeScore) {
        const retainRatio = Math.min(0.95, 0.75 + this._effPassive("safeRetainBonus", 0));
        finalScore = Math.round(this.bankedSafeScore + (this.score - this.bankedSafeScore) * retainRatio);
      }
      this.score = finalScore;
      const summary = this.getSubmissionPayload();
      this._emit("gameOver", summary);
      return summary;
    }

    getPublicState() {
      return {
        status: this.status, mode: this.mode, floor: this.floor, isBossFloor: this.isBossFloor,
        bossTheme: this.bossTheme, guardianHp: this.guardianHp, guardianMaxHp: this.guardianMaxHp,
        timeLeftSec: Number(this.timeLeftSec.toFixed(1)), maxTimeSec: this.maxTimeSec,
        freezeLeftSec: Number(this.freezeLeftSec.toFixed(1)), feverLeftSec: Number(this.feverLeftSec.toFixed(1)),
        score: this.score, bankedSafeScore: this.bankedSafeScore, riskMultiplier: this.riskMultiplier,
        skillCharge: this.skillCharge, persona: this.persona, maxCombo: this.maxCombo,
        totalMoves: this.totalMoves, floorsCleared: this.floorsCleared, bossesDefeated: this.bossesDefeated,
        emergencyShufflesLeft: this.emergencyShufflesLeft, activeItem: this.activeItem,
        opponentTargetScore: this.opponentTargetScore
      };
    }

    getSubmissionPayload() {
      return {
        gameId: "tower_match", sessionId: this.sessionId, mode: this.mode, seed: this.seed,
        personaId: this.personaId, score: this.score, floorsCleared: this.floorsCleared,
        highestFloor: this.floor, bossesDefeated: this.bossesDefeated, totalMoves: this.totalMoves,
        maxCombo: this.maxCombo, durationMs: this.elapsedMs, endReason: this.endReason
      };
    }

    destroy() { this.stopTimer(); this.listeners = {}; }
  }

  window.MoaathTowerEngine = {
    version: "2.0",
    PERSONA_SKILLS,
    loadDailyQuests,
    TowerEngine
  };
})();
