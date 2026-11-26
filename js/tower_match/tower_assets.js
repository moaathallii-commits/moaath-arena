/**
 * حزمة صور لعبة «برج التحدي اللانهائي» (Tower Match-3) — v4.1 Fixed
 * المسار في مستودع عالم التحديات: js/tower_match/tower_assets.js
 */
(function () {
  if (window.MoaathTowerAssets && window.MoaathTowerAssets.version === "4.1-fixed") return;

  const TILE_DEFS = {
    sword:   { id: "sword",   name: "سيف الهجوم",   color: "#ef4444", glow: "rgba(239,68,68,0.55)",  src: "./assets/tower_match/tile_sword.png" },
    clock:   { id: "clock",   name: "ساعة الزمن",   color: "#38bdf8", glow: "rgba(56,189,248,0.55)", src: "./assets/tower_match/tile_clock.png" },
    coin:    { id: "coin",    name: "عملة معاذ",    color: "#facc15", glow: "rgba(250,204,21,0.55)", src: "./assets/tower_match/tile_coin.png" },
    star:    { id: "star",    name: "نجمة المهارة", color: "#c084fc", glow: "rgba(192,132,252,0.55)",src: "./assets/tower_match/tile_star.png" },
    emerald: { id: "emerald", name: "زمردة القوة",  color: "#10b981", glow: "rgba(16,185,129,0.55)", src: "./assets/tower_match/tile_emerald.png" },
    bolt:    { id: "bolt",    name: "صاعقة الكومبو",color: "#f97316", glow: "rgba(249,115,22,0.55)", src: "./assets/tower_match/tile_bolt.png" }
  };

  const SPECIAL_DEFS = {
    row_blast:  { id: "row_blast",  name: "مدفع الصف",    src: "./assets/tower_match/spec_row_blast.png" },
    bomb_3x3:   { id: "bomb_3x3",   name: "قنبلة البرج",  src: "./assets/tower_match/spec_bomb_3x3.png" },
    prism_core: { id: "prism_core", name: "جوهرة الطيف",  src: "./assets/tower_match/spec_prism_core.png" }
  };

  const BOSS_THEMES = [
    { tier: 1, name: "حارس البوابة البرونزية", accent: "#f59e0b", bgTop: "#1c1917", bgBot: "#451a03", src: "./assets/tower_match/boss_1_bronze.png", ability: "يقفل قطعتين كل 12 ثانية — نقطة ضعفه: الكومبو المتتابع أو القنابل." },
    { tier: 2, name: "العملاق السيبراني",      accent: "#38bdf8", bgTop: "#082f49", bgBot: "#0f172a", src: "./assets/tower_match/boss_2_cyber.png",  ability: "يبدّل موقع قطعتين لكسر تنسيقك — أذهله قبل انتهاء العدّاد!" },
    { tier: 3, name: "تنين الزمرد الأسطوري",   accent: "#10b981", bgTop: "#022c22", bgBot: "#064e3b", src: "./assets/tower_match/boss_3_emerald.png", ability: "يزرع حجر طابق صلباً ويعزز دفاعاته — استخدم زمردة الحياة والبركات." },
    { tier: 4, name: "سيد البرج الذهبي",       accent: "#d4af37", bgTop: "#1e1b4b", bgBot: "#3b0764", src: "./assets/tower_match/boss_4_gold.png",    ability: "هجمة صاعقة مزدوجة — يضاعف ضرر هجمته عند نفاذ الوقت." },
    { tier: 5, name: "الزعيم الجليدي",          accent: "#67e8f9", bgTop: "#083344", bgBot: "#164e63", src: "./assets/tower_match/boss_5_frost.png",   ability: "يجمّد قطعتين بصقيع قاتل — فكّها بالتطابق المجاور أو قنبلة 3×3." },
    { tier: 6, name: "زعيم الظل",              accent: "#c084fc", bgTop: "#1e1b4b", bgBot: "#2e1065", src: "./assets/tower_match/boss_6_shadow.png",  ability: "يُخفي ملامح قطعتين في الظلام — ركّز على تطابق المحيط الواضح." },
    { tier: 7, name: "المهندس السيبراني",       accent: "#06b6d4", bgTop: "#042f2e", bgBot: "#0f172a", src: "./assets/tower_match/boss_7_cyber.png",   ability: "يعيد ترتيب قطع متجاورة بدقة رقمية — أوقفه بضربة إذهال STUN." },
    { tier: 8, name: "العنقاء النارية",          accent: "#fb7185", bgTop: "#450a0a", bgBot: "#7f1d1d", src: "./assets/tower_match/boss_8_phoenix.png", ability: "يحرق صفاً كاملاً بنار العنقاء — يمنح ضرراً ضخماً عند إذهاله!" },
    { tier: 9, name: "حارس الزمن",             accent: "#34d399", bgTop: "#064e3b", bgBot: "#111827", src: "./assets/tower_match/boss_9_chrono.png",  ability: "يتلاعب بالساعة ويُسرّع هجماته — اجمع قطع الساعة والبرق باستمرار." }
  ];

  const imgCache = {};

  function preloadAll() {
    const all = [
      ...Object.values(TILE_DEFS).map((t) => ({ key: "tile_" + t.id, src: t.src })),
      ...Object.values(SPECIAL_DEFS).map((s) => ({ key: "spec_" + s.id, src: s.src })),
      ...BOSS_THEMES.map((b) => ({ key: "boss_" + b.tier, src: b.src }))
    ];
    all.forEach((item) => {
      if (imgCache[item.key]) return;
      const img = new Image();
      img.src = item.src;
      imgCache[item.key] = img;
    });
  }

  function getImage(key) {
    if (!imgCache[key]) preloadAll();
    return imgCache[key] || null;
  }

  function getBossForFloor(floorNum, nemesisMeta = null) {
    if (nemesisMeta && nemesisMeta.holderName) {
      return {
        tier: 99,
        isNemesis: true,
        name: `ظل ${nemesisMeta.holderName} الشرير`,
        holderName: nemesisMeta.holderName,
        holderCharId: nemesisMeta.holderCharacterId || 'buddy',
        accent: "#f43f5e",
        bgTop: "#2a0714",
        bgBot: "#090510",
        src: `./assets/chars/${nemesisMeta.holderCharacterId || 'buddy'}.jpg`,
        ability: `النسخة الشريرة للبطل السابق (${nemesisMeta.holderName}) — درع عالٍ وهجمات ظلامية شرسة!`
      };
    }
    const idx = Math.floor(Math.max(0, (floorNum || 1) - 1) / 5) % BOSS_THEMES.length;
    return BOSS_THEMES[idx];
  }

  preloadAll();

  window.MoaathTowerAssets = {
    version: "4.1-fixed",
    TILE_KEYS: Object.keys(TILE_DEFS),
    TILE_DEFS,
    SPECIAL_DEFS,
    BOSS_THEMES,
    preloadAll,
    getImage,
    getBossForFloor
  };
})();
