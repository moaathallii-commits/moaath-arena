/**
 * حزمة صور لعبة «برج التحدي اللانهائي» (Tower Match-3)
 * المسار في مستودع عالم التحديات: js/tower_match/tower_assets.js
 * تحميل الصور الاحترافية المنفصلة من مجلد assets/tower_match/
 */
(function () {
  if (window.MoaathTowerAssets) return;

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
    { tier: 1, name: "حارس البوابة البرونزية", accent: "#f59e0b", bgTop: "#1c1917", bgBot: "#451a03", src: "./assets/tower_match/boss_1_bronze.png" },
    { tier: 2, name: "العملاق السيبراني",      accent: "#38bdf8", bgTop: "#082f49", bgBot: "#0f172a", src: "./assets/tower_match/boss_2_cyber.png" },
    { tier: 3, name: "تنين الزمرد الأسطوري",   accent: "#10b981", bgTop: "#022c22", bgBot: "#064e3b", src: "./assets/tower_match/boss_3_emerald.png" },
    { tier: 4, name: "سيد البرج الذهبي",       accent: "#d4af37", bgTop: "#1e1b4b", bgBot: "#3b0764", src: "./assets/tower_match/boss_4_gold.png" }
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

  function getBossForFloor(floorNum) {
    const idx = Math.floor(Math.max(0, (floorNum || 1) - 1) / 5) % BOSS_THEMES.length;
    return BOSS_THEMES[idx];
  }

  preloadAll();

  window.MoaathTowerAssets = {
    version: "2.0-png",
    TILE_KEYS: Object.keys(TILE_DEFS),
    TILE_DEFS,
    SPECIAL_DEFS,
    BOSS_THEMES,
    preloadAll,
    getImage,
    getBossForFloor
  };
})();
