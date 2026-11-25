/**
 * ============================================================================
 * محرك البرج والوقت السريع وقدرات الشخصيات الـ 18 — «برج التحدي اللانهائي»
 * المسار في مستودع عالم التحديات: js/tower_match/tower_engine.js
 * - عداد تنازلي سريع يتجدد مع كل طابق ومطابقة «ساعة الزمن»
 * - صعود طوابق لا نهائي مع زعماء كل 5 طوابق (Boss Floors + أقفال اللوحة)
 * - آلية «الانسحاب الآمن أو المخاطرة» (Push Your Luck) بعد كل زعيم لمضاعفة النقاط
 * - دمج كامل للشخصيات الـ 18 (9 أساسية + 9 VIP) بقدرات سلبية ومهارات نشطة تُشحن بنجوم المهارة
 * - توازن تلقائي في نمط PvP وتوليد تقرير جلسة موثّق لمنع الغش عبر arena_worker.js
 * ============================================================================
 */
(function () {
  if (window.MoaathTowerEngine) return;

  // --------------------------------------------------------------------------
  // 1. تعريف قدرات ومهارات الشخصيات الـ 18 (9 أساسية + 9 VIP)
  // --------------------------------------------------------------------------
  const PERSONA_SKILLS = {
    // --- الشخصيات الأساسية (9) ---
    buddy: {
      id: "buddy", name: "بندق الودود", tier: "standard",
      passiveLabel: "+2 ثانية وقت بداية",
      skillName: "دفعة ترحيبية",
      skillType: "hint_and_time",
      passive: { startTimeBonus: 2 },
      skillPower: { addSec: 3.5, showHint: true }
    },
    lolo: {
      id: "lolo", name: "لولو النشيطة", tier: "standard",
      passiveLabel: "+8% نقاط إضافية للسرعة",
      skillName: "ومضة السرعة",
      skillType: "convert_and_dmg",
      passive: { scoreMult: 1.08 },
      skillPower: { convertTo: "bolt", count: 3, directDmg: 25 }
    },
    noor: {
      id: "noor", name: "نور الهادئة", tier: "standard",
      passiveLabel: "+0.4 ثانية إضافية لكل مطابقة ساعة",
      skillName: "سكينة الزمن",
      skillType: "freeze_time",
      passive: { clockBonusSec: 0.4 },
      skillPower: { freezeSec: 5, addSec: 2 }
    },
    chef: {
      id: "chef", name: "الشيف الماهر", tier: "standard",
      passiveLabel: "+10% ضرر لسيوف الهجوم",
      skillName: "وصفة الهجوم",
      skillType: "convert_and_dmg",
      passive: { swordDmgMult: 1.10 },
      skillPower: { convertTo: "sword", count: 4, directDmg: 20 }
    },
    pastry: {
      id: "pastry", name: "صانعة الحلويات", tier: "standard",
      passiveLabel: "+12% نقاط لعملات معاذ",
      skillName: "مكافأة الضيافة",
      skillType: "coin_burst",
      passive: { coinScoreMult: 1.12 },
      skillPower: { bonusScore: 180, addSec: 2 }
    },
    athlete: {
      id: "athlete", name: "البطل الرياضي", tier: "standard",
      passiveLabel: "+15% ضرر عند الكومبو ×2 وأعلى",
      skillName: "ضربة الاندفاع",
      skillType: "blast_row",
      passive: { comboDmgMult: 1.15 },
      skillPower: { directDmg: 45 }
    },
    sheikh: {
      id: "sheikh", name: "شيخ الشباب", tier: "standard",
      passiveLabel: "+10% شحن أسرع للمهارة",
      skillName: "فزعة الساحة",
      skillType: "blast_row",
      passive: { skillChargeMult: 1.10 },
      skillPower: { directDmg: 40, addSec: 1.5 }
    },
    saver: {
      id: "saver", name: "خبير التوفير", tier: "standard",
      passiveLabel: "حفظ +10% إضافية من النقاط عند انتهاء الوقت",
      skillName: "صفقة ذكية",
      skillType: "coin_burst",
      passive: { safeRetainBonus: 0.10 },
      skillPower: { bonusScore: 220 }
    },
    homemaker: {
      id: "homemaker", name: "رفيقة المنزل", tier: "standard",
      passiveLabel: "+20% ضرر لكسر أقفال الزعيم",
      skillName: "ترتيب اللوحة",
      skillType: "convert_and_dmg",
      passive: { bossDmgMult: 1.12 },
      skillPower: { convertTo: "emerald", count: 4, directDmg: 25 }
    },

    // --- شخصيات VIP (9) ---
    coach_sakhr: {
      id: "coach_sakhr", name: "كابتن صخر", tier: "vip",
      passiveLabel: "+18% ضرر ضد الزعماء والطوابق",
      skillName: "زلزال الصخر",
      skillType: "blast_row",
      passive: { swordDmgMult: 1.15, bossDmgMult: 1.18 },
      skillPower: { directDmg: 85 }
    },
    grand_chef: {
      id: "grand_chef", name: "الشيف الذهبي", tier: "vip",
      passiveLabel: "+15% ضرر سيوف + 10% نقاط",
      skillName: "الوليمة الذهبية",
      skillType: "convert_and_dmg",
      passive: { swordDmgMult: 1.15, scoreMult: 1.10 },
      skillPower: { convertTo: "sword", count: 6, directDmg: 45 }
    },
    princess_layla: {
      id: "princess_layla", name: "الأميرة ليلى", tier: "vip",
      passiveLabel: "+3 ثوانٍ بداية + تجميد أبطأ للوقت",
      skillName: "هالة الملوك",
      skillType: "freeze_time",
      passive: { startTimeBonus: 3, clockBonusSec: 0.6 },
      skillPower: { freezeSec: 7, addSec: 3.5 }
    },
    butler_farid: {
      id: "butler_farid", name: "السيد فريد", tier: "vip",
      passiveLabel: "+20% نقاط للعملات وحماية أرباح المخاطرة",
      skillName: "خزينة الذهب",
      skillType: "coin_burst",
      passive: { coinScoreMult: 1.20, safeRetainBonus: 0.15 },
      skillPower: { bonusScore: 340, addSec: 2 }
    },
    friend_fadi: {
      id: "friend_fadi", name: "فادي الفرفوش", tier: "vip",
      passiveLabel: "+20% شحن أسرع للمهارة والكومبو",
      skillName: "فرفشة الكومبو",
      skillType: "convert_and_dmg",
      passive: { skillChargeMult: 1.20, comboDmgMult: 1.15 },
      skillPower: { convertTo: "bolt", count: 5, directDmg: 50 }
    },
    anime_zain: {
      id: "anime_zain", name: "كابتن زين", tier: "vip",
      passiveLabel: "+22% ضرر في سلاسل الكومبو السريعة",
      skillName: "عاصفة النصر",
      skillType: "blast_row",
      passive: { comboDmgMult: 1.22, scoreMult: 1.10 },
      skillPower: { directDmg: 90 }
    },
    anime_ryu: {
      id: "anime_ryu", name: "المحقق ريو", tier: "vip",
      passiveLabel: "كشف أسرع للحركات + 15% ضرر زمرد",
      skillName: "بصيرة المحقق",
      skillType: "hint_and_time",
      passive: { bossDmgMult: 1.15, scoreMult: 1.08 },
      skillPower: { addSec: 5, showHint: true, directDmg: 45 }
    },
    anime_ritaj: {
      id: "anime_ritaj", name: "ريتاج", tier: "vip",
      passiveLabel: "+15% نقاط عامة وحظ مضاعف",
      skillName: "انفجار البهجة",
      skillType: "blast_row",
      passive: { scoreMult: 1.15 },
      skillPower: { directDmg: 75, bonusScore: 150 }
    },
    friend_saad: {
      id: "friend_saad", name: "الصديق سعد", tier: "vip",
      passiveLabel: "توازن شامل (+2 ثانية +10% ضرر +10% نقاط)",
      skillName: "بركة الثبات",
      skillType: "freeze_time",
      passive: { startTimeBonus: 2, swordDmgMult: 1.10, scoreMult: 1.10 },
      skillPower: { freezeSec: 6, addSec: 3, directDmg: 40 }
    }
  };

  // --------------------------------------------------------------------------
  // 2. كلاس محرك البرج (TowerEngine)
  // --------------------------------------------------------------------------
  class TowerEngine {
    constructor(config = {}) {
      if (!window.MoaathTowerBoard) {
        throw new Error("MoaathTowerBoard is required before TowerEngine.");
      }

      this.mode = config.mode || "solo"; // 'solo' | 'record' | 'pvp'
      this.seed = config.seed || `tower_${Date.now()}`;
      this.sessionId = config.sessionId || null;
      this.personaId = PERSONA_SKILLS[config.personaId] ? config.personaId : "buddy";
      this.persona = PERSONA_SKILLS[this.personaId];

      // في نمط PvP نوازن القدرات السلبية قليلاً لضمان عدالة المنافسة
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
      return () => {
        this.listeners[eventName] = (this.listeners[eventName] || []).filter((fn) => fn !== cb);
      };
    }

    _emit(eventName, payload) {
      (this.listeners[eventName] || []).forEach((fn) => {
        try { fn(payload); } catch (_) {}
      });
    }

    _effPassive(key, fallback = 1) {
      const raw = this.persona?.passive?.[key];
      if (raw === undefined) return fallback;
      if (!this.isBalancedPvp) return raw;
      // في PvP نخفف الفارق إلى 50% ليبقى التنافس عادلاً ومعتمداً على المهارة
      if (fallback === 1) return 1 + (raw - 1) * 0.5;
      return raw * 0.5;
    }

    resetState() {
      this.stopTimer();
      this.status = "idle"; // idle | playing | boss_decision | ended
      this.floor = 1;
      this.isBossFloor = false;
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(1)
        : { tier: 1, name: "حارس البوابة البرونزية", accent: "#f59e0b" };

      this.maxTimeSec = 45;
      const startBonus = this._effPassive("startTimeBonus", 0);
      this.timeLeftSec = Math.min(this.maxTimeSec, 35 + startBonus);
      this.freezeLeftSec = 0;

      this.guardianMaxHp = this._calcFloorHp(1);
      this.guardianHp = this.guardianMaxHp;

      this.score = 0;
      this.bankedSafeScore = 0;
      this.riskMultiplier = 1.0;

      this.skillCharge = 0; // 0..100
      this.maxCombo = 0;
      this.totalMoves = 0;
      this.floorsCleared = 0;
      this.bossesDefeated = 0;
      this.startedAtMs = 0;
      this.elapsedMs = 0;
      this.endReason = null;
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
      if (this._timerId !== null) {
        clearInterval(this._timerId);
        this._timerId = null;
      }
    }

    _tick() {
      if (this.status !== "playing") return;
      const now = Date.now();
      const dtSec = Math.min(0.5, Math.max(0.02, (now - this._lastTickMs) / 1000));
      this._lastTickMs = now;
      this.elapsedMs += Math.round(dtSec * 1000);

      if (this.freezeLeftSec > 0) {
        this.freezeLeftSec = Math.max(0, this.freezeLeftSec - dtSec);
      } else {
        // تسارع طفيف جداً للوقت في الطوابق العليا لرفع الحماس
        const drainRate = 1 + Math.min(0.45, (this.floor - 1) * 0.02);
        this.timeLeftSec = Math.max(0, this.timeLeftSec - dtSec * drainRate);
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
        freezeLeftSec: this.freezeLeftSec
      });
    }

    // ------------------------------------------------------------------------
    // 3. تنفيذ حركة اللاعب وحساب الضرر والوقت والنقاط وشحن المهارة
    // ------------------------------------------------------------------------
    performSwap(r1, c1, r2, c2) {
      if (this.status !== "playing") {
        return { valid: false, reason: "not_playing" };
      }

      const res = this.board.trySwap(r1, c1, r2, c2);
      if (!res.valid) {
        this._emit("invalidSwap", { r1, c1, r2, c2, reason: res.reason });
        return res;
      }

      this.totalMoves++;
      const t = res.totals;
      if (t.maxCombo > this.maxCombo) this.maxCombo = t.maxCombo;

      const comboMult = 1 + (Math.max(1, t.maxCombo) - 1) * 0.35;
      const passiveComboMult = t.maxCombo >= 2 ? this._effPassive("comboDmgMult", 1) : 1;
      const swordMult = this._effPassive("swordDmgMult", 1);
      const bossMult = this.isBossFloor ? this._effPassive("bossDmgMult", 1) : 1;
      const scoreMult = this._effPassive("scoreMult", 1);
      const coinMult = this._effPassive("coinScoreMult", 1);
      const chargeMult = this._effPassive("skillChargeMult", 1);
      const clockExtra = this._effPassive("clockBonusSec", 0);

      const byType = t.clearedByType;

      // 1) حساب الضرر الموجه لحارس الطابق / الزعيم
      const rawDmg =
        byType.sword * 14 * swordMult +
        byType.bolt * 12 +
        byType.emerald * (this.isBossFloor ? 16 : 10) +
        byType.coin * 4 +
        byType.star * 5 +
        byType.clock * 4 +
        t.specialsTriggered * 26 +
        t.locksBroken * 15;

      const finalDmg = Math.max(8, Math.round(rawDmg * comboMult * passiveComboMult * bossMult));

      // 2) حساب الوقت المضاف من ساعات الزمن والكومبو العالي
      let addedSec = 0;
      if (byType.clock > 0) {
        addedSec += byType.clock * (0.9 + clockExtra);
      }
      if (t.maxCombo >= 3) {
        addedSec += 1.2;
      }
      if (addedSec > 0) {
        this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + addedSec);
      }

      // 3) حساب النقاط المكتسبة
      const rawScore =
        t.clearedCount * 10 +
        byType.coin * 24 * coinMult +
        t.specialsTriggered * 55 +
        t.locksBroken * 35;

      const gainedScore = Math.round(rawScore * comboMult * scoreMult * this.riskMultiplier);
      this.score += gainedScore;

      // 4) شحن مهارة الشخصية من نجوم المهارة والقطع المطابقة
      const prevReady = this.skillCharge >= 100;
      const chargeGain = (byType.star * 14 + t.clearedCount * 2.2) * chargeMult;
      this.skillCharge = Math.min(100, Math.round(this.skillCharge + chargeGain));
      if (!prevReady && this.skillCharge >= 100) {
        this._emit("skillReady", { persona: this.persona });
      }

      // 5) تطبيق الضرر على الحارس
      this.guardianHp = Math.max(0, this.guardianHp - finalDmg);

      const movePayload = {
        swap: res.swap,
        steps: res.steps,
        totals: t,
        damage: finalDmg,
        addedSec: Number(addedSec.toFixed(1)),
        gainedScore,
        reshuffled: res.reshuffled,
        boardAfter: res.boardAfter,
        state: this.getPublicState()
      };
      this._emit("move", movePayload);

      // 6) التحقق من هزيمة حارس الطابق أو الزعيم
      if (this.guardianHp <= 0) {
        this._onFloorDefeated();
      }

      return { ...res, effects: { damage: finalDmg, addedSec, gainedScore } };
    }

    // ------------------------------------------------------------------------
    // 4. تفعيل مهارة الشخصية النشطة (عند وصول الشحن إلى 100%)
    // ------------------------------------------------------------------------
    activateSkill() {
      if (this.status !== "playing") return { ok: false, reason: "not_playing" };
      if (this.skillCharge < 100) return { ok: false, reason: "not_charged" };

      this.skillCharge = 0;
      const p = this.persona;
      const sp = p.skillPower || {};
      let boardUpdate = null;
      let hint = null;
      let directDmg = sp.directDmg || 0;
      let addedSec = sp.addSec || 0;
      let bonusScore = sp.bonusScore || 0;

      if (p.skillType === "blast_row") {
        const res = this.board.skillBlastRow();
        boardUpdate = res.boardAfter;
        directDmg += (res.step.cleared.length || 6) * 8;
      } else if (p.skillType === "convert_and_dmg") {
        const res = this.board.skillConvertRandomTiles(sp.convertTo || "sword", sp.count || 4);
        boardUpdate = res.boardAfter;
      } else if (p.skillType === "freeze_time") {
        this.freezeLeftSec = Math.max(this.freezeLeftSec, sp.freezeSec || 5);
      } else if (p.skillType === "hint_and_time") {
        hint = this.board.findBestHint();
      }

      if (addedSec > 0) {
        this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + addedSec);
      }
      if (bonusScore > 0) {
        this.score += Math.round(bonusScore * this.riskMultiplier);
      }
      if (directDmg > 0) {
        this.guardianHp = Math.max(0, this.guardianHp - directDmg);
      }

      const payload = {
        persona: p,
        directDmg,
        addedSec,
        bonusScore,
        freezeSec: sp.freezeSec || 0,
        hint,
        boardAfter: boardUpdate || this.board.getSnapshot(),
        state: this.getPublicState()
      };
      this._emit("skillUsed", payload);

      if (this.guardianHp <= 0) {
        this._onFloorDefeated();
      }
      return { ok: true, ...payload };
    }

    // ------------------------------------------------------------------------
    // 5. الصعود للطابق التالي + قرار الزعيم (الانسحاب الآمن أو المخاطرة)
    // ------------------------------------------------------------------------
    _onFloorDefeated() {
      const wasBoss = this.isBossFloor;
      this.floorsCleared++;
      const floorBonus = Math.round((wasBoss ? 250 : 80) * this.floor * this.riskMultiplier);
      this.score += floorBonus;

      if (wasBoss) {
        this.bossesDefeated++;
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
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(this.floor)
        : { tier: 1, name: "حارس البرج", accent: "#f59e0b" };

      this.guardianMaxHp = this._calcFloorHp(this.floor);
      this.guardianHp = this.guardianMaxHp;

      // تجديد العداد التنازلي مع كل طابق (تمديد أكبر بعد هزيمة زعيم)
      const timeRefill = afterBoss ? 18 : 9;
      this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + timeRefill);

      let bossLocks = [];
      if (this.isBossFloor) {
        const lockCount = Math.min(6, 2 + Math.floor(this.floor / 5));
        bossLocks = this.board.applyBossLocks(lockCount);
      }

      this._emit("floorCleared", {
        newFloor: this.floor,
        isBossFloor: this.isBossFloor,
        bossTheme: this.bossTheme,
        timeRefill,
        bossLocks,
        boardAfter: this.board.getSnapshot(),
        state: this.getPublicState()
      });
    }

    _finishGame(reason) {
      this.stopTimer();
      this.status = "ended";
      this.endReason = reason;

      // عند انتهاء الوقت بعد المخاطرة، يحتفظ اللاعب بـ 75% (+مكافأة الشخصية) من مكسب المخاطرة
      let finalScore = this.score;
      if (reason === "timeout" && this.bankedSafeScore > 0 && this.score > this.bankedSafeScore) {
        const retainRatio = Math.min(0.95, 0.75 + this._effPassive("safeRetainBonus", 0));
        const riskGain = this.score - this.bankedSafeScore;
        finalScore = Math.round(this.bankedSafeScore + riskGain * retainRatio);
      }
      this.score = finalScore;

      const summary = this.getSubmissionPayload();
      this._emit("gameOver", summary);
      return summary;
    }

    getPublicState() {
      return {
        status: this.status,
        mode: this.mode,
        floor: this.floor,
        isBossFloor: this.isBossFloor,
        bossTheme: this.bossTheme,
        guardianHp: this.guardianHp,
        guardianMaxHp: this.guardianMaxHp,
        timeLeftSec: Number(this.timeLeftSec.toFixed(1)),
        maxTimeSec: this.maxTimeSec,
        freezeLeftSec: Number(this.freezeLeftSec.toFixed(1)),
        score: this.score,
        bankedSafeScore: this.bankedSafeScore,
        riskMultiplier: this.riskMultiplier,
        skillCharge: this.skillCharge,
        persona: this.persona,
        maxCombo: this.maxCombo,
        totalMoves: this.totalMoves,
        floorsCleared: this.floorsCleared,
        bossesDefeated: this.bossesDefeated
      };
    }

    // حزمة بيانات نظيفة وموثّقة للإرسال إلى arena_worker.js (/session/submit)
    getSubmissionPayload() {
      return {
        gameId: "tower_match",
        sessionId: this.sessionId,
        mode: this.mode,
        seed: this.seed,
        personaId: this.personaId,
        score: this.score,
        floorsCleared: this.floorsCleared,
        highestFloor: this.floor,
        bossesDefeated: this.bossesDefeated,
        totalMoves: this.totalMoves,
        maxCombo: this.maxCombo,
        durationMs: this.elapsedMs,
        endReason: this.endReason
      };
    }

    destroy() {
      this.stopTimer();
      this.listeners = {};
    }
  }

  window.MoaathTowerEngine = {
    version: "1.0",
    PERSONA_SKILLS,
    TowerEngine
  };
})();
