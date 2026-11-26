/**
 * ============================================================================
 * محرك البرج والوقت السريع v3.0 Ultra — «برج التحدي اللانهائي»
 * المسار: js/tower_match/tower_engine.js
 * إضافات v3.0:
 * - إيقاف مؤقت تلقائي عند الخروج لتطبيق آخر (واتساب) لحماية وقت اللاعب ومنع الحظر
 * - عداد تحذير هجمة الزعيم (12ث) + مقاطعة الهجمة وإذهال الزعيم (STUN ×1.5)
 * - مستويات الحماس المتصاعدة (×1.5 حماس ذهبي → ×2.0 انفجار أقصى Overdrive)
 * - الضربات الحرجة (CRIT!) + صندوق الغنيمة الخاطف (5 ثوانٍ)
 * - معدّلات الطوابق العشوائية + مهمة سريعة داخل الطابق + بركات Roguelike بعد كل زعيم
 * - طور النخبة الصعب (Hardcore Endless) يبدأ من الطابق 10 بمضاعف ×1.5
 * ============================================================================
 */
(function () {
  const QUESTS_KEY = "moaath_tower_daily_quests_v1";

  const PERSONA_SKILLS = {
    // === 9 شخصيات أساسية (متوازنة 100% تنافسياً) ===
    buddy:     { id: "buddy",     name: "بندق الودود",     tier: "standard", archetype: "time",   quote: "يا سلام عليك! كفو!",       skillName: "دفعة ترحيبية",  skillType: "hint_and_time",   passive: { startTimeBonus: 2 },                  skillPower: { addSec: 3.5, directDmg: 30, showHint: true } },
    lolo:      { id: "lolo",      name: "لولو النشيطة",    tier: "standard", archetype: "attack", quote: "سرعة البرق! كمّل!",       skillName: "ومضة السرعة",   skillType: "convert_and_dmg", passive: { scoreMult: 1.06 },                    skillPower: { convertTo: "bolt", count: 4, directDmg: 35 } },
    noor:      { id: "noor",      name: "نور الهادئة",     tier: "standard", archetype: "time",   quote: "هدوء وتركيز.. ضربة رائعة!",skillName: "سكينة الزمن",   skillType: "freeze_time",     passive: { clockBonusSec: 0.35 },                skillPower: { freezeSec: 5, addSec: 2 } },
    chef:      { id: "chef",      name: "الشيف الماهر",    tier: "standard", archetype: "attack", quote: "وصفة نارية على أصولها!",  skillName: "وصفة الهجوم",   skillType: "convert_and_dmg", passive: { swordDmgMult: 1.08 },                 skillPower: { convertTo: "sword", count: 4, directDmg: 35 } },
    pastry:    { id: "pastry",    name: "صانعة الحلويات",  tier: "standard", archetype: "logic",  quote: "أحلى كومبو في الساحة!",   skillName: "مكافأة الضيافة",skillType: "coin_burst",      passive: { coinScoreMult: 1.08 },                skillPower: { bonusScore: 180, addSec: 2 } },
    athlete:   { id: "athlete",   name: "البطل الرياضي",   tier: "standard", archetype: "attack", quote: "قوة ولياقة! لا تتوقف!",   skillName: "ضربة الاندفاع", skillType: "blast_row",       passive: { comboDmgMult: 1.10 },                 skillPower: { directDmg: 50 } },
    sheikh:    { id: "sheikh",    name: "شيخ الشباب",      tier: "standard", archetype: "attack", quote: "فزعة الأبطال! أبدعت!",    skillName: "فزعة الساحة",   skillType: "blast_row",       passive: { skillChargeMult: 1.10 },              skillPower: { directDmg: 45, addSec: 1.5 } },
    saver:     { id: "saver",     name: "خبير التوفير",    tier: "standard", archetype: "logic",  quote: "صفقة رابحة 100%!",        skillName: "صفقة ذكية",     skillType: "coin_burst",      passive: { safeRetainBonus: 0.08 },              skillPower: { bonusScore: 200, directDmg: 20 } },
    homemaker: { id: "homemaker", name: "رفيقة المنزل",    tier: "standard", archetype: "logic",  quote: "ترتيب ونظام ولا أروع!",   skillName: "ترتيب اللوحة",  skillType: "convert_and_dmg", passive: { bossDmgMult: 1.10 },                  skillPower: { convertTo: "emerald", count: 4, directDmg: 35 } },

    // === 9 شخصيات VIP (نفس السقف التنافسي العادل تماماً — تميّزها في XP والـ Cashback والهيبة) ===
    coach_sakhr:    { id: "coach_sakhr",    name: "كابتن صخر",    tier: "vip", archetype: "attack", quote: "حطّم البرج بقوة الصخر!",     skillName: "زلزال الصخر",    skillType: "blast_row",       passive: { swordDmgMult: 1.08 },    skillPower: { directDmg: 52 } },
    grand_chef:     { id: "grand_chef",     name: "الشيف الذهبي", tier: "vip", archetype: "attack", quote: "وليمة انتصار ذهبية!",         skillName: "الوليمة الذهبية", skillType: "convert_and_dmg", passive: { scoreMult: 1.06 },       skillPower: { convertTo: "sword", count: 4, directDmg: 35 } },
    princess_layla: { id: "princess_layla", name: "الأميرة ليلى", tier: "vip", archetype: "time",   quote: "أداء ملكي لا يُضاهى!",        skillName: "هالة الملوك",    skillType: "freeze_time",     passive: { clockBonusSec: 0.35 },   skillPower: { freezeSec: 5, addSec: 2 } },
    butler_farid:   { id: "butler_farid",   name: "السيد فريد",   tier: "vip", archetype: "logic",  quote: "خزينة الذهب تمتليء يا سيدي!", skillName: "خزينة الذهب",    skillType: "coin_burst",      passive: { coinScoreMult: 1.08 },   skillPower: { bonusScore: 200, addSec: 1.5 } },
    friend_fadi:    { id: "friend_fadi",    name: "فادي الفرفوش", tier: "vip", archetype: "attack", quote: "يا عيني على الفرفشة والكومبو!",skillName: "فرفشة الكومبو", skillType: "convert_and_dmg", passive: { skillChargeMult: 1.10 }, skillPower: { convertTo: "bolt", count: 4, directDmg: 35 } },
    anime_zain:     { id: "anime_zain",     name: "كابتن زين",    tier: "vip", archetype: "attack", quote: "عاصفة النصر لا تُقهر!",       skillName: "عاصفة النصر",    skillType: "blast_row",       passive: { comboDmgMult: 1.10 },    skillPower: { directDmg: 52 } },
    anime_ryu:      { id: "anime_ryu",      name: "المحقق ريو",   tier: "vip", archetype: "logic",  quote: "كل حركة محسوبة بدقة!",        skillName: "بصيرة المحقق",   skillType: "hint_and_time",   passive: { bossDmgMult: 1.10 },     skillPower: { addSec: 3.5, directDmg: 30, showHint: true } },
    anime_ritaj:    { id: "anime_ritaj",    name: "ريتاج",        tier: "vip", archetype: "logic",  quote: "انفجار بهجة ونقاط!",          skillName: "انفجار البهجة",  skillType: "blast_row",       passive: { scoreMult: 1.06 },       skillPower: { directDmg: 45, bonusScore: 100 } },
    friend_saad:    { id: "friend_saad",    name: "الصديق سعد",   tier: "vip", archetype: "time",   quote: "ثبات وإتقان.. أحسنت!",        skillName: "بركة الثبات",    skillType: "freeze_time",     passive: { startTimeBonus: 2 },     skillPower: { freezeSec: 5, addSec: 2 } }
  };

  const FLOOR_MODIFIERS = [
    { id: "sword_storm", label: "⚔️ عاصفة السيوف: ضرر السيوف ×1.5", swordMult: 1.5 },
    { id: "time_surge", label: "⏱️ زمن مضاعف: الساعات تمنح وقتاً مضاعفاً", clockMult: 2.0 },
    { id: "coin_rain", label: "🪙 مطر العملات: نقاط العملات ×1.5", coinMult: 1.5 }
  ];

  const ROGUELIKE_PERKS = [
    { id: "perk_sword", img: "./assets/tower_match/perks/perk_sword.png", title: "حد السيف (+20% ضرر)", desc: "يرفع ضرر جميع السيوف حتى نهاية الجولة." },
    { id: "perk_clock", img: "./assets/tower_match/perks/perk_clock.png", title: "نبض الزمن (+1.2ث/ساعة)", desc: "كل مطابقة ساعة تمنح وقتاً إضافياً." },
    { id: "perk_skill", img: "./assets/tower_match/perks/perk_skill.png", title: "شحن فائق (+25% مهارة)", desc: "تشحن مهارة شخصيتك بشكل أسرع." }
  ];

  function getTodayKey() { return new Date().toISOString().slice(0, 10); }

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
      if (q.progress >= q.target) { q.progress = q.target; q.done = true; newlyCompleted.push(q); }
    });
    try { localStorage.setItem(QUESTS_KEY, JSON.stringify(data)); } catch (_) {}
    return { data, newlyCompleted };
  }

  class TowerEngine {
    constructor(config = {}) {
      if (!window.MoaathTowerBoard) throw new Error("MoaathTowerBoard is required.");
      this.mode = config.mode || "record";
      this.nemesisBoss = config.nemesisBoss || null; // 'record' | 'pvp' | 'practice' | 'daily_boss' | 'hardcore'
      this.seed = config.seed || (this.mode === "daily_boss" ? `daily_${getTodayKey()}` : `tower_${Date.now()}`);
      this.sessionId = config.sessionId || null;
      this.personaId = PERSONA_SKILLS[config.personaId] ? config.personaId : "buddy";
      this.persona = PERSONA_SKILLS[this.personaId];
      this.activeItem = config.activeItem || null;
      this.opponentTargetScore = Number(config.opponentTargetScore || 0);
      this.isBalancedPvp = this.mode === "pvp";

      this.board = new window.MoaathTowerBoard.TowerBoard({
        rows: config.rows || 6, cols: config.cols || 6, seed: this.seed
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
      this.status = "idle"; // idle | playing | paused | boss_decision | ended
      this.floor = this.mode === "hardcore" ? 10 : 1;
      this.isBossFloor = this.floor % 5 === 0;
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(this.floor, this.floor >= 10 && this.mode === 'record' ? this.nemesisBoss : null)
        : { tier: 1, name: "حارس البوابة البرونزية", accent: "#f59e0b", bgTop: "#1c1917", bgBot: "#451a03" };

      this.maxTimeSec = 50;
      const startBonus = this._effPassive("startTimeBonus", 0);
      const itemTimeBonus = (this.activeItem === "fuel_boost" || this.activeItem === "tower_time10") ? 10 : 0;
      this.timeLeftSec = Math.min(this.maxTimeSec, 35 + startBonus + itemTimeBonus);
      this.freezeLeftSec = 0;

      // الحماس المتصاعد (0=عادي، 1=حماس ذهبي ×1.5، 2=انفجار أقصى ×2.0)
      this.feverTier = 0;
      this.feverLeftSec = 0;
      this._recentMatchTimes = [];

      // عداد تحذير هجمة الزعيم
      this.bossAttackMaxSec = 12;
      this.bossAttackCooldownSec = 12;

      // صندوق الغنيمة الخاطف (يظهر لمدة 5 ثوانٍ)
      this.flashChestLeftSec = 0;
      this._chestSpawnCooldown = 14;

      // معدّل الطابق والمهمة السريعة داخل الطابق وبركات Roguelike
      this.floorModifier = null;
      this.miniObjective = this._makeMiniObjective(this.floor);
      this.perks = { swordBonus: 0, clockBonus: 0, skillBonus: 0 };

      this.emergencyShufflesLeft = 1;
      this.guardianMaxHp = this._calcFloorHp(this.floor);
      this.guardianHp = this.guardianMaxHp;

      this.score = 0;
      this.bankedSafeScore = 0;
      this.riskMultiplier = this.mode === "hardcore" ? 1.5 : 1.0;

      this.skillCharge = (this.activeItem === "tower_skill50") ? 50 : 0;
      this.maxCombo = 0;
      this.totalMoves = 0;
      this.floorsCleared = 0;
      this.bossesDefeated = 0;
      this.specialsDetonated = 0;
      this.elapsedMs = 0;
      this.endReason = null;

      if (this.activeItem === "tower_bomb" || this.activeItem === "shield_1") {
        this.board.spawnStartingSpecial("bomb_3x3");
      } else if (this.activeItem === "tower_row") {
        this.board.spawnStartingSpecial("row_blast");
      } else if (this.activeItem === "tower_wildcard") {
        this.board.spawnStartingSpecial("prism_core");
      }
      if (this.mode === "hardcore") {
        this.board.applyIceObstacles(3, 2);
      }
    }

    _makeMiniObjective(floorNum) {
      const types = [
        { type: "sword", label: "طابق 4 سيوف ⚔️", target: 4 },
        { type: "emerald", label: "طابق 4 زمردات 💎", target: 4 },
        { type: "coin", label: "طابق 4 عملات 🪙", target: 4 }
      ];
      const pick = types[(floorNum - 1) % types.length];
      return { ...pick, progress: 0, done: false };
    }

    _calcFloorHp(floorNum) {
      const isBoss = floorNum % 5 === 0;
      const base = 90 + (floorNum - 1) * 28 + Math.floor(Math.pow(floorNum, 1.35) * 6);
      const nemesisMult = (isBoss && this.bossTheme && this.bossTheme.isNemesis) ? 1.45 : 1;
      return isBoss ? Math.round(base * 1.65 * nemesisMult) : base;
    }

    start() {
      this.resetState();
      this.status = "playing";
      this._startTimer();
      this._emit("state", this.getPublicState());
      return this.getPublicState();
    }

    pause() {
      if (this.status !== "playing") return false;
      this.status = "paused";
      this.stopTimer();
      this._emit("paused", this.getPublicState());
      return true;
    }

    resume() {
      if (this.status !== "paused") return false;
      this.status = "playing";
      this._startTimer();
      this._emit("resumed", this.getPublicState());
      return true;
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
        if (this.feverLeftSec === 0) this.feverTier = 0;
      }

      // صندوق الغنيمة الخاطف
      if (this.flashChestLeftSec > 0) {
        this.flashChestLeftSec = Math.max(0, this.flashChestLeftSec - dtSec);
        if (this.flashChestLeftSec === 0) {
          if (this.board.clearFlashChest()) {
            this._emit("chestExpired", { boardAfter: this.board.getSnapshot() });
          }
        }
      } else {
        this._chestSpawnCooldown -= dtSec;
        if (this._chestSpawnCooldown <= 0) {
          this._chestSpawnCooldown = 18;
          if (this.board.spawnFlashChest()) {
            this.flashChestLeftSec = 5.0;
            this._emit("chestSpawned", { boardAfter: this.board.getSnapshot(), durationSec: 5 });
          }
        }
      }

      if (this.freezeLeftSec > 0) {
        this.freezeLeftSec = Math.max(0, this.freezeLeftSec - dtSec);
      } else {
        const drainRate = 1 + Math.min(0.45, (this.floor - 1) * 0.02);
        this.timeLeftSec = Math.max(0, this.timeLeftSec - dtSec * drainRate);
      }

      // عداد تحذير وهجمة الزعيم
      if (this.isBossFloor && this.freezeLeftSec <= 0) {
        this.bossAttackCooldownSec = Math.max(0, this.bossAttackCooldownSec - dtSec);
        if (this.bossAttackCooldownSec <= 0) {
          this.bossAttackCooldownSec = this.bossAttackMaxSec;
          this._triggerBossMechanic();
        }
      }

      if (this.timeLeftSec <= 5 && this.timeLeftSec > 0) {
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
        feverLeftSec: this.feverLeftSec,
        feverTier: this.feverTier,
        bossAttackCooldownSec: this.bossAttackCooldownSec,
        bossAttackMaxSec: this.bossAttackMaxSec,
        isBossFloor: this.isBossFloor
      });
    }

    _triggerBossMechanic() {
      const tier = this.bossTheme?.tier || 1;
      let label = "";
      if (tier === 1) { this.board.applyBossLocks(2); label = "🔒 حارس البوابة أقفل قطعتين!"; }
      else if (tier === 2 || tier === 7) { this.board.bossSwapRandomPair(); label = "🔀 تبديل رقمي فاجأ اللوحة!"; }
      else if (tier === 5) { this.board.applyBossLocks(2); label = "❄️ صقيع الزعيم الجليدي جمّد قطعتين!"; }
      else if (tier === 6) { this.board.applyBossLocks(2); label = "🌑 زعيم الظل ألقى ظلامه على قطعتين!"; }
      else if (tier === 8) { this.board.applyBossLocks(2); label = "🔥 لهب العنقاء النارية اشتعل في اللوحة!"; }
      else if (tier === 9) { this.bossAttackCooldownSec = Math.max(4, this.bossAttackCooldownSec - 3); label = "⏳ حارس الزمن سرّع عدّاد الهجمة!"; }
      else if (tier === 99) {
        const nemCharId = (this.nemesisBoss && this.nemesisBoss.holderCharacterId) || "buddy";
        const nemArch = (PERSONA_SKILLS[nemCharId] && PERSONA_SKILLS[nemCharId].archetype) || "attack";
        if (nemArch === "time") {
          this.timeLeftSec = Math.max(1, this.timeLeftSec - 2.5);
          label = "⏳ ظل البطل الشرير استنزف 2.5 ثانية من وقتك!";
        } else if (nemArch === "logic") {
          this.board.applyIceObstacles(2, 2);
          this.board.bossSwapRandomPair();
          label = "❄️ ظل البطل الشرير جمّد قطعتين وشوّش اللوحة!";
        } else {
          this.board.applyBossLocks(3);
          label = "⚡ صاعقة ظل البطل الشرير أقفلت 3 قطع!";
        }
      }
      else if (tier === 3) { this.timeLeftSec = Math.max(1, this.timeLeftSec - 2.0); label = "🐉 تنين الزمرد استنزف ثانيتين!"; }
      else { this.board.applyIceObstacles(2, 2); label = "❄️ سيد البرج جمّد قطعتين!"; }
      this._emit("bossAttack", { tier, label, boardAfter: this.board.getSnapshot(), state: this.getPublicState() });
    }

    _checkFeverActivation() {
      const now = Date.now();
      this._recentMatchTimes.push(now);
      this._recentMatchTimes = this._recentMatchTimes.filter((t) => now - t <= 4200);
      if (this._recentMatchTimes.length >= 3) {
        this._recentMatchTimes = [];
        if (this.feverTier === 0) {
          this.feverTier = 1;
          this.feverLeftSec = 6.0;
          this._emit("feverStart", { tier: 1, mult: 1.5 });
        } else if (this.feverTier === 1) {
          this.feverTier = 2;
          this.feverLeftSec = 6.0;
          this._emit("feverStart", { tier: 2, mult: 2.0 });
        } else {
          this.feverLeftSec = Math.min(7.0, this.feverLeftSec + 2.0);
        }
      }
    }

    _applyMoveResult(res) {
      this.totalMoves++;
      const t = res.totals;
      if (t.maxCombo > this.maxCombo) this.maxCombo = t.maxCombo;
      this.specialsDetonated += t.specialsTriggered || 0;
      this._checkFeverActivation();

      const feverMult = this.feverTier === 2 ? 2.0 : (this.feverTier === 1 ? 1.5 : 1.0);
      const comboMult = 1 + (Math.max(1, t.maxCombo) - 1) * 0.35;
      const passiveComboMult = t.maxCombo >= 2 ? this._effPassive("comboDmgMult", 1) : 1;
      const swordMult = (this._effPassive("swordDmgMult", 1) + this.perks.swordBonus) * (this.floorModifier?.swordMult || 1);
      const bossMult = this.isBossFloor ? this._effPassive("bossDmgMult", 1) : 1;
      const scoreMult = this._effPassive("scoreMult", 1);
      const coinMult = this._effPassive("coinScoreMult", 1) * (this.floorModifier?.coinMult || 1);
      const chargeMult = this._effPassive("skillChargeMult", 1) + this.perks.skillBonus;
      const clockExtra = this._effPassive("clockBonusSec", 0) + this.perks.clockBonus;
      const clockModMult = this.floorModifier?.clockMult || 1;

      const byType = t.clearedByType;
      const isCrit = byType.sword >= 4;

      // مقاطعة هجمة الزعيم (Boss Stun / Counter-Break)
      let bossStunned = false;
      if (this.isBossFloor && this.bossAttackCooldownSec <= 4.0 && (t.maxCombo >= 3 || t.specialsTriggered > 0)) {
        bossStunned = true;
        this.bossAttackCooldownSec = this.bossAttackMaxSec;
      }

      const rawDmg =
        byType.sword * 14 * swordMult * (isCrit ? 1.4 : 1) +
        byType.bolt * 12 +
        byType.emerald * (this.isBossFloor ? 16 : 10) +
        byType.coin * 4 + byType.star * 5 + byType.clock * 4 +
        t.specialsTriggered * 30 + t.locksBroken * 15 + (t.iceBroken || 0) * 14;

      const finalDmg = Math.max(10, Math.round(rawDmg * comboMult * passiveComboMult * bossMult * feverMult * (bossStunned ? 1.5 : 1)));

      let addedSec = 0;
      if (byType.clock > 0) addedSec += byType.clock * (0.9 + clockExtra) * clockModMult;
      if (t.maxCombo >= 3) addedSec += 1.2;
      if (t.chestsOpened > 0) {
        this.flashChestLeftSec = 0;
        addedSec += 3.0 * t.chestsOpened;
      }

      // المهمة السريعة داخل الطابق
      let miniObjCompleted = false;
      if (this.miniObjective && !this.miniObjective.done) {
        const gain = byType[this.miniObjective.type] || 0;
        if (gain > 0) {
          this.miniObjective.progress = Math.min(this.miniObjective.target, this.miniObjective.progress + gain);
          if (this.miniObjective.progress >= this.miniObjective.target) {
            this.miniObjective.done = true;
            miniObjCompleted = true;
            addedSec += 4.0;
            this.skillCharge = 100;
          }
        }
      }

      if (addedSec > 0) this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + addedSec);

      const goldenBonus = (t.goldenCollected || 0) * 180 + (t.chestsOpened || 0) * 250;
      const rawScore =
        t.clearedCount * 10 + byType.coin * 24 * coinMult +
        t.specialsTriggered * 60 + t.locksBroken * 35 + (t.iceBroken || 0) * 25 + goldenBonus;

      const gainedScore = Math.round(rawScore * comboMult * scoreMult * this.riskMultiplier * feverMult);
      this.score += gainedScore;

      const prevReady = this.skillCharge >= 100;
      const chargeGain = (byType.star * 14 + t.clearedCount * 2.2) * chargeMult;
      this.skillCharge = Math.min(100, Math.round(this.skillCharge + chargeGain));
      if (!prevReady && this.skillCharge >= 100) this._emit("skillReady", { persona: this.persona });

      this.guardianHp = Math.max(0, this.guardianHp - finalDmg);

      if (this.mode !== "practice") {
        const qRes = updateDailyQuests({ specials: t.specialsTriggered || 0, maxCombo: t.maxCombo });
        if (qRes.newlyCompleted.length) this._emit("questDone", qRes.newlyCompleted);
      }

      const payload = {
        swap: res.swap, steps: res.steps, totals: t, damage: finalDmg,
        addedSec: Number(addedSec.toFixed(1)), gainedScore, isCrit, bossStunned,
        miniObjCompleted, wildcardSpawned: !!res.wildcardSpawned,
        goldenCollected: t.goldenCollected || 0, chestsOpened: t.chestsOpened || 0,
        feverTier: this.feverTier, reshuffled: res.reshuffled,
        boardAfter: res.boardAfter, state: this.getPublicState()
      };
      this._emit("move", payload);

      if (this.guardianHp <= 0) this._onFloorDefeated();
      return { ...res, effects: { damage: finalDmg, addedSec, gainedScore } };
    }

    performSwap(r1, c1, r2, c2) {
      if (this.status !== "playing") return { valid: false, reason: "not_playing" };
      const res = this.board.trySwap(r1, c1, r2, c2);
      if (!res.valid) { this._emit("invalidSwap", { r1, c1, r2, c2, reason: res.reason }); return res; }
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
      const p = this.persona, sp = p.skillPower || {};
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
          perks: ROGUELIKE_PERKS,
          state: this.getPublicState()
        });
        return;
      }
      this._advanceToNextFloor(false);
    }

    continueClimbing(selectedPerkId = null) {
      if (this.status !== "boss_decision") return false;
      if (selectedPerkId === "perk_sword") this.perks.swordBonus += 0.20;
      if (selectedPerkId === "perk_clock") this.perks.clockBonus += 1.2;
      if (selectedPerkId === "perk_skill") this.perks.skillBonus += 0.25;
      this.riskMultiplier = Number((this.riskMultiplier + 0.25).toFixed(2));
      this.status = "playing";
      this._advanceToNextFloor(true);
      this._startTimer();
      return true;
    }

    retreatSafely() {
      if (this.status !== "boss_decision" && this.status !== "playing" && this.status !== "paused") return false;
      this._finishGame("safe_retreat");
      return true;
    }

    _advanceToNextFloor(afterBoss) {
      this.floor++;
      this.isBossFloor = this.floor % 5 === 0;
      this.bossAttackCooldownSec = this.bossAttackMaxSec;
      this.bossTheme = window.MoaathTowerAssets
        ? window.MoaathTowerAssets.getBossForFloor(this.floor, this.floor >= 10 && this.mode === 'record' ? this.nemesisBoss : null)
        : { tier: 1, name: "حارس البرج", accent: "#f59e0b", bgTop: "#1c1917", bgBot: "#451a03" };

      // معدّل الطابق كل طابقين
      this.floorModifier = this.floor % 2 === 0
        ? FLOOR_MODIFIERS[(Math.floor(this.floor / 2) - 1) % FLOOR_MODIFIERS.length]
        : null;
      this.miniObjective = this._makeMiniObjective(this.floor);

      // أشكال لوحات متغيرة في الطوابق العليا
      if (this.floor >= 6 && this.floor % 4 === 2) this.board.applyFloorMask("corners");
      else if (this.floor >= 8 && this.floor % 4 === 0 && !this.isBossFloor) this.board.applyFloorMask("center");
      else this.board.applyFloorMask("none");

      this.guardianMaxHp = this._calcFloorHp(this.floor);
      this.guardianHp = this.guardianMaxHp;

      const timeRefill = afterBoss ? 18 : 9;
      this.timeLeftSec = Math.min(this.maxTimeSec, this.timeLeftSec + timeRefill);

      if (this.floor % 3 === 0) this.board.spawnGoldenProductTile();
      if (this.floor >= 10 && !this.isBossFloor) {
        this.board.applyIceObstacles(Math.min(4, 1 + Math.floor((this.floor - 10) / 3)), 2);
      }

      let bossLocks = [];
      if (this.isBossFloor) {
        bossLocks = this.board.applyBossLocks(Math.min(5, 2 + Math.floor(this.floor / 5)));
        this.board.spawnChainBarrel();
      }

      this._emit("floorCleared", {
        newFloor: this.floor, isBossFloor: this.isBossFloor, bossTheme: this.bossTheme,
        timeRefill, bossLocks, floorModifier: this.floorModifier,
        boardAfter: this.board.getSnapshot(), state: this.getPublicState()
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
        feverTier: this.feverTier, bossAttackCooldownSec: Number(this.bossAttackCooldownSec.toFixed(1)),
        bossAttackMaxSec: this.bossAttackMaxSec, floorModifier: this.floorModifier,
        miniObjective: this.miniObjective, score: this.score, bankedSafeScore: this.bankedSafeScore,
        riskMultiplier: this.riskMultiplier, skillCharge: this.skillCharge, persona: this.persona,
        maxCombo: this.maxCombo, totalMoves: this.totalMoves, floorsCleared: this.floorsCleared,
        bossesDefeated: this.bossesDefeated, emergencyShufflesLeft: this.emergencyShufflesLeft,
        activeItem: this.activeItem, opponentTargetScore: this.opponentTargetScore
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

  window.MoaathTowerEngine = { version: "3.0", PERSONA_SKILLS, loadDailyQuests, TowerEngine };
})();
