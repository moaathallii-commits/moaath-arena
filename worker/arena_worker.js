/**
 * Moaath Arena World - Cloudflare Worker (Upgraded Shop + SYP Bridge + Safe CORS)
 * المسار في GitHub (مستودع moaath-arena): worker/arena_worker.js
 * السياسة الأمنية: 0% ذكاء اصطناعي في المال أو النقاط أو التحويلات أو شام كاش.
 */

const ALLOWED_CASHOUT_TIERS = [100, 200, 500, 1000];
const CASHOUT_AUDIT_DELAY_MS = 60 * 60 * 1000;
const ROLLING_LEDGER_DAYS = 7;
const ADMIN_EMAIL = '0965461504@moaath.store';
const WEEKLY_GAMES = ['tower_match', 'hill_drive', 'cyber_shooter'];
const WEEKLY_GAME_TITLES = {
  tower_match: 'برج التحدي اللانهائي',
  hill_drive: 'قيادة التلال 2D',
  cyber_shooter: 'ميجا شوتر 2D'
};
// التوزيع: 10% للإدارة + 40% أول + 20% ثاني + 15% ثالث + 5% رابع + 4% خامس + 3.5% سادس + 2.5% سابع = 100%
const WEEKLY_ADMIN_PCT = 0.10;
const WEEKLY_RANK_SPLITS = [0.40, 0.20, 0.15, 0.05, 0.04, 0.035, 0.025];


const BASIC_CHARS = ['buddy', 'lolo', 'noor', 'chef', 'pastry', 'athlete', 'sheikh', 'saver', 'homemaker'];
const VIP_CHARS = ['coach_sakhr', 'grand_chef', 'princess_layla', 'butler_farid', 'friend_fadi', 'anime_zain', 'anime_ryu', 'anime_ritaj', 'friend_saad'];

const SHOP_PRICES = {
  shield_1: { price: 25, type: 'tactical', name: 'درع الحماية' },
  fuel_boost: { price: 20, type: 'tactical', name: 'خزان وقود إضافي' },
  double_xp: { price: 15, type: 'tactical', name: 'مضاعف XP' },
  tower_bomb: { price: 25, type: 'tactical', name: 'قنبلة البرج (3×3)' },
  tower_row: { price: 20, type: 'tactical', name: 'مدفع الصف الخارق' },
  tower_wildcard: { price: 35, type: 'tactical', name: 'جوكر البداية' },
  extra_hp: { price: 25, type: 'tactical', name: 'قلب إضافي (+1 HP)' },
  fuel_magnet: { price: 20, type: 'tactical', name: 'مغناطيس الوقود' },
  streak_shield: { price: 30, type: 'passive', name: 'حماية السلسلة' },
  bundle_starter: { price: 80, type: 'bundle', name: 'باقة المنطلق', grants: { shield_1: 2, fuel_boost: 2 } },
  arena_pass: { price: 40, type: 'pass', name: 'تذكرة الساحة (5 جولات)', grants: { arena_pass: 5 } },
  frame_gold: { price: 0, reqXp: 300, type: 'cosmetic', name: 'الإطار الملكي الذهبي' },
  frame_cyber: { price: 0, reqXp: 800, type: 'cosmetic', name: 'إطار سايبر الماسي' }
};



function getEffectiveShopItem(itemId, config) {
  const base = SHOP_PRICES[itemId];
  if (!base) return null;
  const ov = (config && config.shopOverrides && config.shopOverrides[itemId]) || {};
  return {
    ...base,
    price: ov.price !== undefined ? Math.max(0, Number(ov.price)) : Number(base.price || 0),
    reqXp: ov.reqXp !== undefined ? Math.max(0, Number(ov.reqXp)) : Number(base.reqXp || 0)
  };
}

function getEffectiveShopCatalog(config) {
  return Object.keys(SHOP_PRICES).map((id) => ({
    id,
    ...getEffectiveShopItem(id, config)
  }));
}

function getEffectiveGameEntryFees(config) {
  const f = (config && config.gameEntryFees) || {};
  const defFee = Math.max(1, Number((config && config.recordEntryCostPts) || 10));
  return {
    tower_match: Math.max(1, Number(f.tower_match !== undefined ? f.tower_match : defFee)),
    hill_drive: Math.max(1, Number(f.hill_drive !== undefined ? f.hill_drive : defFee)),
    cyber_shooter: Math.max(1, Number(f.cyber_shooter !== undefined ? f.cyber_shooter : defFee))
  };
}

function getLockedModesConfig(config) {
  const lm = (config && config.lockedModes) || {};
  return {
    tower_match: Boolean(lm.tower_match),
    hill_drive: Boolean(lm.hill_drive),
    cyber_shooter: Boolean(lm.cyber_shooter),
    weekly: Boolean(lm.weekly),
    pvp: Boolean(lm.pvp),
    events: Boolean(lm.events)
  };
}

function checkModeLock(config, gameId, mode) {
  const lm = getLockedModesConfig(config);
  if (gameId && lm[gameId]) {
    return 'هذه اللعبة مغلقة مؤقتاً من الإدارة.';
  }
  if (mode === 'weekly' && lm.weekly) {
    return 'البطولة الأسبوعية مغلقة مؤقتاً من الإدارة.';
  }
  if ((mode === 'pvp' || mode === 'pvp_create' || mode === 'pvp_join') && lm.pvp) {
    return 'ساحة التحدي المباشر (PvP) مغلقة مؤقتاً من الإدارة.';
  }
  if (mode === 'events' && lm.events) {
    return 'أحداث التحدي مغلقة مؤقتاً من الإدارة.';
  }
  return null;
}

const DEFAULT_FRAMES_CATALOG = [
  { id: 'frame_01_steel', level: 1, name: 'إطار المبتدئ الفولاذي', file: './assets/frames/frame_01_steel.png', rarity: 'common', anim: 'anim-pulse-soft', price: 15, reqXp: 50 },
  { id: 'frame_02_bronze', level: 2, name: 'إطار البرونز العتيق', file: './assets/frames/frame_02_bronze.png', rarity: 'common', anim: 'anim-pulse-soft', price: 25, reqXp: 150 },
  { id: 'frame_03_silver', level: 3, name: 'إطار الفضة اللامعة', file: './assets/frames/frame_03_silver.png', rarity: 'common', anim: 'anim-shine', price: 35, reqXp: 300 },
  { id: 'frame_04_neon_blue', level: 4, name: 'إطار النيون السماوي', file: './assets/frames/frame_04_neon_blue.png', rarity: 'rare', anim: 'anim-neon', price: 40, reqXp: 0 },
  { id: 'frame_05_emerald', level: 5, name: 'إطار الزمرد الحيوي', file: './assets/frames/frame_05_emerald.png', rarity: 'rare', anim: 'anim-shine', price: 50, reqXp: 500 },
  { id: 'frame_06_flame', level: 6, name: 'إطار اللهب البركاني', file: './assets/frames/frame_06_flame.png', rarity: 'rare', anim: 'anim-flame', price: 60, reqXp: 0 },
  { id: 'frame_07_frost', level: 7, name: 'إطار الجليد الكريستالي', file: './assets/frames/frame_07_frost.png', rarity: 'rare', anim: 'anim-neon', price: 75, reqXp: 750 },
  { id: 'frame_08_lightning', level: 8, name: 'إطار الصاعقة الذهبية', file: './assets/frames/frame_08_lightning.png', rarity: 'epic', anim: 'anim-electric', price: 90, reqXp: 0 },
  { id: 'frame_09_amethyst', level: 9, name: 'إطار الأرجوان الغامض', file: './assets/frames/frame_09_amethyst.png', rarity: 'epic', anim: 'anim-aura', price: 110, reqXp: 1100 },
  { id: 'frame_10_gold_crown', level: 10, name: 'إطار التاج الذهبي', file: './assets/frames/frame_10_gold_crown.png', rarity: 'epic', anim: 'anim-royal', price: 130, reqXp: 1500 },
  { id: 'frame_11_cyber_diamond', level: 11, name: 'إطار سايبر الماسي', file: './assets/frames/frame_11_cyber_diamond.png', rarity: 'legendary', anim: 'anim-neon', price: 140, reqXp: 0 },
  { id: 'frame_12_phoenix', level: 12, name: 'إطار أجنحة العنقاء', file: './assets/frames/frame_12_phoenix.png', rarity: 'legendary', anim: 'anim-flame', price: 180, reqXp: 2200 },
  { id: 'frame_13_dragon', level: 13, name: 'إطار التنين الأسطوري', file: './assets/frames/frame_13_dragon.png', rarity: 'legendary', anim: 'anim-aura', price: 200, reqXp: 0 },
  { id: 'frame_14_galaxy', level: 14, name: 'إطار المجرة الكونية', file: './assets/frames/frame_14_galaxy.png', rarity: 'mythic', anim: 'anim-galaxy', price: 260, reqXp: 3500 },
  { id: 'frame_15_emperor', level: 15, name: 'إطار إمبراطور عالم معاذ', file: './assets/frames/frame_15_emperor.png', rarity: 'mythic', anim: 'anim-emperor', price: 350, reqXp: 5000 }
];

function getEffectiveFramesCatalog(config) {
  const overrides = (config && config.frameOverrides) || {};
  return DEFAULT_FRAMES_CATALOG.map((f) => {
    const ov = overrides[f.id] || {};
    return {
      ...f,
      price: ov.price !== undefined ? Math.max(0, Number(ov.price)) : f.price,
      reqXp: ov.reqXp !== undefined ? Math.max(0, Number(ov.reqXp)) : f.reqXp
    };
  });
}


// ============================================================================
// مسار الـ 360 يوماً الحصري لبرج التحدي اللانهائي (20 مكافأة: 7 ألقاب + 7 شارات + 6 إطارات أسطورية)
// ============================================================================
const TOWER_STREAK_REWARDS = [
  { step: 1,  day: 1,   type: 'title', id: 'title_tower_01', name: 'متسلق البرج', rarity: 'common' },
  { step: 2,  day: 3,   type: 'badge', id: 'badge_tower_01_spark', name: 'شرارة الصعود', file: './assets/tower_match/streak/badge_tower_01_spark.png', rarity: 'common' },
  { step: 3,  day: 7,   type: 'frame', id: 'frame_streak_01_copper', name: 'إطار بوابة النحاس', file: './assets/tower_match/streak/frame_streak_01_copper.png', rarity: 'rare', anim: 'fx-copper' },
  { step: 4,  day: 14,  type: 'title', id: 'title_tower_02', name: 'صياد الكومبو', rarity: 'rare' },
  { step: 5,  day: 21,  type: 'badge', id: 'badge_tower_02_sword', name: 'سيف الطوابق', file: './assets/tower_match/streak/badge_tower_02_sword.png', rarity: 'rare' },
  { step: 6,  day: 30,  type: 'frame', id: 'frame_streak_02_silver', name: 'إطار الحارس الفضي', file: './assets/tower_match/streak/frame_streak_02_silver.png', rarity: 'rare', anim: 'fx-silver' },
  { step: 7,  day: 40,  type: 'title', id: 'title_tower_03', name: 'كاسر الأرقام', rarity: 'epic' },
  { step: 8,  day: 52,  type: 'badge', id: 'badge_tower_03_breaker', name: 'محطم الحجارة', file: './assets/tower_match/streak/badge_tower_03_breaker.png', rarity: 'epic' },
  { step: 9,  day: 65,  type: 'title', id: 'title_tower_04', name: 'مُذهل الزعماء', rarity: 'epic' },
  { step: 10, day: 80,  type: 'badge', id: 'badge_tower_04_hype2x', name: 'درع الحماس ×2', file: './assets/tower_match/streak/badge_tower_04_hype2x.png', rarity: 'epic' },
  { step: 11, day: 95,  type: 'frame', id: 'frame_streak_03_ruby', name: 'إطار الياقوت المشتعل', file: './assets/tower_match/streak/frame_streak_03_ruby.png', rarity: 'epic', anim: 'fx-ruby' },
  { step: 12, day: 115, type: 'title', id: 'title_tower_05', name: 'سيد البركات', rarity: 'legendary' },
  { step: 13, day: 135, type: 'badge', id: 'badge_tower_05_combo_diamond', name: 'نجمة الكومبو الماسية', file: './assets/tower_match/streak/badge_tower_05_combo_diamond.png', rarity: 'legendary' },
  { step: 14, day: 160, type: 'title', id: 'title_tower_06', name: 'مرعب الـ PvP', rarity: 'legendary' },
  { step: 15, day: 185, type: 'frame', id: 'frame_streak_04_dragon', name: 'إطار التنين القرمزي', file: './assets/tower_match/streak/frame_streak_04_dragon.png', rarity: 'legendary', anim: 'fx-dragon' },
  { step: 16, day: 215, type: 'badge', id: 'badge_tower_06_elite', name: 'نخبة البرج', file: './assets/tower_match/streak/badge_tower_06_elite.png', rarity: 'mythic' },
  { step: 17, day: 245, type: 'title', id: 'title_tower_07', name: 'شبح الطوابق العليا', rarity: 'mythic' },
  { step: 18, day: 280, type: 'frame', id: 'frame_streak_05_phoenix', name: 'إطار العنقاء الذهبية', file: './assets/tower_match/streak/frame_streak_05_phoenix.png', rarity: 'mythic', anim: 'fx-phoenix' },
  { step: 19, day: 320, type: 'badge', id: 'badge_tower_07_crown', name: 'التاج الإمبراطوري', file: './assets/tower_match/streak/badge_tower_07_crown.png', rarity: 'mythic' },
  { step: 20, day: 360, type: 'frame', id: 'frame_streak_06_galaxy', name: 'إطار عرش المجرة', bonusTitle: 'أسطورة برج التحدي', file: './assets/tower_match/streak/frame_streak_06_galaxy.png', rarity: 'mythic', anim: 'fx-galaxy' }
];

function getTowerPlayerData(player) {
  const g = (player && player.games && player.games.tower_match) || {};
  return {
    streakDays: Number(g.streakDays || 0),
    lastCheckInDate: g.lastCheckInDate || '',
    claimedSteps: g.claimedSteps || {},
    titles: g.titles || {},
    badges: g.badges || {},
    activeTitle: g.activeTitle || '',
    activeBadge: g.activeBadge || '',
    lastPvpLoss: g.lastPvpLoss || null
  };
}

function getActiveBroadcast(config) {
  const b = config && config.broadcast;
  if (!b || !b.active || !b.text) return null;
  if (b.expiresAt && Date.now() > Number(b.expiresAt)) return null;
  return { text: String(b.text), type: b.type || 'info', expiresAt: Number(b.expiresAt || 0) };
}

async function recordAdminRevenue(env, source, pts) {
  const amount = Math.max(0, Math.floor(Number(pts || 0)));
  if (amount <= 0) return;
  const stats = (await fbGet(env, 'arena_world/admin_stats')) || {};
  const bySource = stats.bySource || {};
  bySource[source] = Number(bySource[source] || 0) + amount;
  await fbPatch(env, 'arena_world/admin_stats', {
    totalRevenuePts: Number(stats.totalRevenuePts || 0) + amount,
    bySource,
    updatedAt: Date.now()
  });
}

async function processDueAutoCashouts(env, config) {
  if (!config || !config.autoCashoutEnabled) return 0;
  const cashouts = await fbGet(env, 'arena_world/pending_cashouts');
  if (!cashouts) return 0;
  const now = Date.now();
  let count = 0;
  for (const [txId, c] of Object.entries(cashouts)) {
    if (!c || c.status !== 'pending_audit' || !c.autoEligible) continue;
    if (now < Number(c.releaseAt || 0)) continue;
    const player = await fbGet(env, `arena_world/players/${c.phone}`);
    if (!player || player.frozen) continue;
    const auditOk = await verifyRollingLedger(env, player);
    if (!auditOk) {
      await flagAndFreeze(env, player, 'LEDGER_MISMATCH_ON_AUTO_CASHOUT', { txId });
      continue;
    }
    const storeUser = await fbGet(env, `users/${c.phone}`);
    const currentUsd = Number((storeUser && storeUser.prepaidBalanceUSD) || 0);
    const newUsd = Number((currentUsd + Number(c.usdAmount)).toFixed(4));
    await fbPatch(env, `users/${c.phone}`, { prepaidBalanceUSD: newUsd });
    await fbPatch(env, `arena_world/pending_cashouts/${txId}`, { status: 'approved', autoApproved: true, resolvedAt: now });
    await fbPatch(env, `arena_world/bridge_transfers/${txId}`, {
      phone: c.phone, direction: 'arena_to_store', pts: c.pts, usdAmount: c.usdAmount, status: 'completed', autoApproved: true, createdAt: now
    });
    count++;
  }
  return count;
}


// ============================================================================
// المرحلة 4: 50 بطاقة استفزاز + صناديق المتجر + معادلة كسر الرقم 75%/15%/10% + زعيم الظل
// ============================================================================
const TAUNT_RARITIES = {
  common:    { label: 'عادي',    cratePrice: 20, weight: 70 },
  rare:      { label: 'نادر',     cratePrice: 45, weight: 22 },
  epic:      { label: 'ملحمي',   cratePrice: 90, weight: 6.5 },
  legendary: { label: 'أسطوري',  cratePrice: 180, weight: 1.5 }
};

const CRATE_BUNDLES = {
  crate_basic:     { id: 'crate_basic',     name: 'صندوق الاستفزاز العادي',   price: 25,  rarity: 'common',    emoji: '📦', img: './assets/tower_match/crates/crate_basic.png' },
  crate_epic:      { id: 'crate_epic',      name: 'صندوق الاستفزاز الملحمي', price: 75,  rarity: 'epic',      emoji: '🎁', img: './assets/tower_match/crates/crate_epic.png' },
  crate_legendary: { id: 'crate_legendary', name: 'صندوق الاستفزاز الأسطوري',price: 160, rarity: 'legendary', emoji: '👑', img: './assets/tower_match/crates/crate_legendary.png' }
};

const TAUNTS_50 = (() => {
  const list = [];
  const commonTexts = [
    'البرج واسع للي يتقن الصعود 😉', 'حركة حلوة.. بس العرش بعيد شوي!', 'كومبو لذيذ، جرّب تزوّده حبتين!',
    'الزعيم ضحك على هاي الضربة 😄', 'قريب.. بس مو قريب كفاية!', 'خلي أعصابك باردة بالبرج 🧊',
    'أهلاً بك في ملعب الكبار 👋', 'تحتاج شوية قنبلة وتضبط الأمور 💣', 'لا تستسلم، الطابق الجاي أسهل.. ربما!',
    'سجلناها في دفتر الذكريات 📝', 'الخطوة الجاية هي الحاسمة!', 'إحماء جيد قبل الجد!',
    'نقطة ورا نقطة يطلع البطل!', 'البرج يحب السريعين ⚡', 'مرور الكرام على العرش!',
    'خلّي الجوكر يشتغل لصالحك 🃏', 'طابق واحد كان يفصلك!', 'تحية من قمة البرج 👋',
    'بداية موفقة للضغط على الزر!', 'ننتظرك في الجولة الجاية!'
  ];
  const rareTexts = [
    'أخذنا العرش على البارد ❄️👑', 'الزعيم انصدم من سرعتك.. وأنا أكثر!', 'هجمة مرتدة بـ 180 درجة 🔄',
    'الرقم صار تحت الحماية المشددة 🛡️', 'كومبو متتالي يكسر الخواطر 🔥', 'أهلاً بمنافس التحدي الجديد ⚔️',
    'النتيجة تتكلم والبقية تستمع 🎯', 'حماس ×2 ولسا في بقية!', 'الطابق الحاسم ما يرحم أحد!',
    'أمسكنا بالصدارة بيد من حديد 🪙', 'نكهة الفوز لها طعم مختلف 😋', 'أداء تكتيكي مرتب جداً!',
    'تحدي مقبول والنتيجة حاضرة!', 'البرج صار باسمنا مؤقتاً 🏰', 'ضربة إذهال في الصميم ⚡'
  ];
  const epicTexts = [
    'عرشك تحت السيطرة الكاملة الآن 👑🔥', 'أهلاً بك في صفوف من لمسوا القمة!', 'تحطيم الأرقام هواية مو صدفة 💥',
    'النسخة الشريرة للبرج تشهد لنا!', 'أقوى من توقعات الجدول الأسبوعي!', 'عاصفة كومبو لا تُرد 🌪️',
    'شخصيتك تعبت وهي تطارد الرقم!', 'البطولة الأسبوعية اشتعلت نارها 🔥', 'سيطرة كاملة على أرض البرج!',
    'مكافأة الفوز وصلت قبل ما تبرد!'
  ];
  const legTexts = [
    'أسطورة البرج لا تُقهر — العرش لنا! 🌌👑', 'سقوط عرش وإعلان إمبراطور جديد للبرج!',
    'رقم قياسي يكتب اسمه بحروف من ذهب ✨', 'هيبة الملك في قمة برج التحدي اللانهائي!',
    'الجميع يطارد الظل بينما نحن في القمة 🏆'
  ];
  commonTexts.forEach((txt, i) => list.push({ id: `t_c_${i+1}`, rarity: 'common', text: txt }));
  rareTexts.forEach((txt, i) => list.push({ id: `t_r_${i+1}`, rarity: 'rare', text: txt }));
  epicTexts.forEach((txt, i) => list.push({ id: `t_e_${i+1}`, rarity: 'epic', text: txt }));
  legTexts.forEach((txt, i) => list.push({ id: `t_l_${i+1}`, rarity: 'legendary', text: txt }));
  return list;
})();

async function pushPlayerNotification(env, targetPhone, notif) {
  if (!targetPhone) return;
  const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await fbPatch(env, `arena_world/notifications/${targetPhone}/${id}`, { ...notif, read: false, at: Date.now() });
}

async function runAutomaticTowerStreakForPlayer(env, player) {
  const tData = getTowerPlayerData(player);
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);
  const twoDaysAgoStr = new Date(now - 2 * 86400000).toISOString().slice(0, 10);

  if (tData.lastCheckInDate === todayStr) {
    return { autoClaimed: false, streakDays: tData.streakDays, newlyUnlocked: [] };
  }

  let streakDays = tData.streakDays;
  if (!tData.lastCheckInDate || tData.lastCheckInDate === yesterdayStr || tData.lastCheckInDate === twoDaysAgoStr) {
    streakDays = Math.min(360, streakDays + 1);
  } else {
    const inv = player.inventory || {};
    if ((inv.streak_shield || 0) > 0) {
      inv.streak_shield -= 1;
      streakDays = Math.min(360, streakDays + 1);
      await fbPatch(env, `arena_world/players/${player.phone}`, { inventory: inv });
    } else {
      streakDays = 1;
    }
  }

  const claimedSteps = { ...tData.claimedSteps };
  const titles = { ...tData.titles };
  const badges = { ...tData.badges };
  const cos = { ...(player.cosmetics || {}) };
  const newlyUnlocked = [];

  for (const r of TOWER_STREAK_REWARDS) {
    if (streakDays >= r.day && !claimedSteps[r.step]) {
      claimedSteps[r.step] = now;
      if (r.type === 'title') titles[r.id] = r.name;
      if (r.type === 'badge') badges[r.id] = { name: r.name, file: r.file };
      if (r.type === 'frame') {
        cos[r.id] = true;
        if (r.bonusTitle) titles['title_tower_legend'] = r.bonusTitle;
      }
      newlyUnlocked.push(r);
    }
  }

  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, {
    streakDays, lastCheckInDate: todayStr, claimedSteps, titles, badges
  });
  if (newlyUnlocked.some((x) => x.type === 'frame')) {
    await fbPatch(env, `arena_world/players/${player.phone}`, { cosmetics: cos });
  }
  return { autoClaimed: true, streakDays, newlyUnlocked };
}


// ============================================================================
// المرحلة 8: التحدي الدائم (Bounty PvP) + الأدوات الفخرية الأسطورية + نظام الإحالة الصارم (5%)
// ============================================================================
const PVP_DEFENSE_PRESTIGE = [
  { count: 5,  id: 'pvp_def_5',  name: '🛡️ حارس الساحة',          rarity: 'rare',      file: './assets/pvp_prestige/pvp_def_5.png' },
  { count: 10, id: 'pvp_def_10', name: '⚔️ صائد المتحدين',         rarity: 'epic',      file: './assets/pvp_prestige/pvp_def_10.png' },
  { count: 15, id: 'pvp_def_15', name: '🔥 مرعب الساحة',           rarity: 'epic',      file: './assets/pvp_prestige/pvp_def_15.png' },
  { count: 20, id: 'pvp_def_20', name: '💀 جلاد الـ PvP',          rarity: 'legendary', file: './assets/pvp_prestige/pvp_def_20.png' },
  { count: 25, id: 'pvp_def_25', name: '👑 سيد الجماجم',           rarity: 'legendary', file: './assets/pvp_prestige/pvp_def_25.png' },
  { count: 50, id: 'pvp_def_50', name: '🌌 إمبراطور الجماجم الخالد', rarity: 'mythic',    file: './assets/pvp_prestige/pvp_def_50.png' }
];

const PVP_STREAK_PRESTIGE = [
  { count: 3,  id: 'pvp_str_3',  name: '⚡ شرارة الانتصار (×3)',     rarity: 'rare',      file: './assets/pvp_prestige/pvp_str_3.png' },
  { count: 5,  id: 'pvp_str_5',  name: '🌪️ عاصفة الساحة (×5)',      rarity: 'epic',      file: './assets/pvp_prestige/pvp_str_5.png' },
  { count: 10, id: 'pvp_str_10', name: '🔥 قاهر الأبطال (×10)',     rarity: 'legendary', file: './assets/pvp_prestige/pvp_str_10.png' },
  { count: 20, id: 'pvp_str_20', name: '🏆 أسطورة الـ PvP المطلقة', rarity: 'mythic',    file: './assets/pvp_prestige/pvp_str_20.png' }
];

async function ensurePlayerRefCode(env, player) {
  if (player.refCode) return player.refCode;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ref_' + String(player.phone || '')));
  const code = 'MTH' + Array.from(new Uint8Array(buf)).slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  await fbPatch(env, `arena_world/players/${player.phone}`, { refCode: code });
  await fbPatch(env, `arena_world/ref_codes/${code}`, { phone: player.phone, createdAt: Date.now() });
  player.refCode = code;
  return code;
}

async function resolveValidReferrer(env, refCode, newPhone, deviceId) {
  const cleanCode = String(refCode || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 5) return '';
  const refObj = await fbGet(env, `arena_world/ref_codes/${cleanCode}`);
  if (!refObj || !refObj.phone) return '';
  const refPhone = String(refObj.phone);
  // قيد صارم 1: منع الإحالة الذاتية
  if (refPhone === String(newPhone)) return '';
  // قيد صارم 2: منع الإحالة من نفس الجهاز
  const devObj = deviceId ? await fbGet(env, `arena_world/devices/${deviceId}`) : null;
  if (devObj && String(devObj.phone || '') === refPhone) return '';
  const refPlayer = await fbGet(env, `arena_world/players/${refPhone}`);
  if (!refPlayer || refPlayer.frozen || (deviceId && refPlayer.lastDeviceId === deviceId)) return '';
  return refPhone;
}

async function creditReferralFromApprovedTopup(env, player, addedCoins, sourceTxId) {
  const refPhone = player && player.referredBy ? String(player.referredBy) : '';
  if (!refPhone || refPhone === String(player.phone)) return;
  const bonus = Math.floor(Number(addedCoins || 0) * 0.05);
  if (bonus <= 0) return;

  // قيد صارم 3: لا يُصرف البونص إلا للاعب حقيقي أكمل جولة لعب واحدة على الأقل
  if (Number(player.totalRoundsPlayed || 0) < 1) {
    const prevPending = Number(player.pendingRefBonusPts || 0);
    await fbPatch(env, `arena_world/players/${player.phone}`, { pendingRefBonusPts: prevPending + bonus });
    return;
  }

  const referrer = await fbGet(env, `arena_world/players/${refPhone}`);
  if (!referrer || referrer.frozen) return;
  const now = Date.now();
  await updatePlayerBalance(env, referrer, bonus, {
    txId: `ref5_${sourceTxId}`, type: 'referral_bonus_5pct', delta: bonus, fromPhone: player.phone, at: now
  });
  const stats = referrer.referralStats || {};
  await fbPatch(env, `arena_world/players/${refPhone}/referralStats`, {
    totalEarnedPts: Number(stats.totalEarnedPts || 0) + bonus,
    totalCount: Number(stats.totalCount || 0)
  });
  const admStats = (await fbGet(env, 'arena_world/admin_stats')) || {};
  await fbPatch(env, 'arena_world/admin_stats', {
    referralPaidPts: Number(admStats.referralPaidPts || 0) + bonus
  });
  await pushPlayerNotification(env, refPhone, {
    kind: 'referral_bonus',
    title: '🎁 عمولة إحالة (5%)!',
    body: `حصلت على +${bonus.toLocaleString()} عملة من شحن أحد أصدقائك المدعوين!`
  });
}

async function releasePendingReferralIfEligible(env, player) {
  const pending = Number(player.pendingRefBonusPts || 0);
  if (pending <= 0 || !player.referredBy || player.referredBy === player.phone) return;
  await fbPatch(env, `arena_world/players/${player.phone}`, { pendingRefBonusPts: 0 });
  const referrer = await fbGet(env, `arena_world/players/${player.referredBy}`);
  if (!referrer || referrer.frozen) return;
  const now = Date.now();
  await updatePlayerBalance(env, referrer, pending, {
    txId: `ref5_rel_${now}`, type: 'referral_bonus_5pct', delta: pending, fromPhone: player.phone, at: now
  });
  const stats = referrer.referralStats || {};
  await fbPatch(env, `arena_world/players/${player.referredBy}/referralStats`, {
    totalEarnedPts: Number(stats.totalEarnedPts || 0) + pending,
    totalCount: Number(stats.totalCount || 0)
  });
  const admStats = (await fbGet(env, 'arena_world/admin_stats')) || {};
  await fbPatch(env, 'arena_world/admin_stats', {
    referralPaidPts: Number(admStats.referralPaidPts || 0) + pending
  });
}


// ============================================================================
// المرحلة 12: حماية منع التكرار (Idempotency) + حماية تخمين كلمات المرور (Rate Limit)
// ============================================================================
async function checkOrLockIdempotency(env, key, scope) {
  const clean = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!clean || clean.length < 8) return { ok: true, key: null };
  const path = `arena_world/idem/${scope}_${clean}`;
  const existing = await fbGet(env, path);
  if (existing && (Date.now() - Number(existing.at || 0)) < 10 * 60 * 1000) {
    return { ok: false, cached: existing.response || null };
  }
  await fbPatch(env, path, { at: Date.now(), status: 'locked' });
  return { ok: true, key: path };
}


// ============================================================================
// المرحلة 17: قاعدة التعزيز الديناميكي حسب ارتفاع الجائزة (مع استثناء PvP بالكامل)
// ============================================================================
function computeDynamicBoostPct(config, mode, prizePts) {
  if (!config || config.dynamicBoostEnabled === false) return 0;
  // استثناء صارم لتحديات PvP الموجودة مسبقاً والجديدة حفظاً للعدالة التنافسية
  if (mode === 'pvp' || mode === 'pvp_create' || mode === 'pvp_join') return 0;
  const stepPts = Math.max(10, Number(config.dynamicBoostStepPts || 100));
  const pctPerStep = Math.max(0, Math.min(50, Number(config.dynamicBoostPctPerStep || 8)));
  const maxPct = Math.max(0, Math.min(150, Number(config.dynamicBoostMaxPct || 80)));
  const excess = Math.max(0, Number(prizePts || 0) - 100);
  const steps = Math.floor(excess / stepPts);
  return Math.min(maxPct, steps * pctPerStep);
}

const DAILY_DEAL_POOL = ['tower_bomb', 'tower_row', 'tower_wildcard', 'double_xp', 'streak_shield'];

function getTodayDailyDeal() {
  const dayStr = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < dayStr.length; i++) hash = (hash * 31 + dayStr.charCodeAt(i)) % 997;
  const itemId = DAILY_DEAL_POOL[hash % DAILY_DEAL_POOL.length];
  const discountPct = 20;
  const tomorrow = new Date(dayStr + 'T00:00:00Z').getTime() + 24 * 60 * 60 * 1000;
  return { dayStr, itemId, discountPct, expiresAt: tomorrow };
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return corsResponse(null, 204);

      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        const hasUrl = Boolean(env.FIREBASE_DB_URL && env.FIREBASE_DB_URL.trim());
        const hasSecret = Boolean(env.FIREBASE_DB_SECRET && env.FIREBASE_DB_SECRET.trim());
        let fbTest = 'not_tested';
        if (hasUrl && hasSecret) {
          const baseUrl = normalizeDbUrl(env.FIREBASE_DB_URL);
          const testRes = await fetch(`${baseUrl}/arena_world/config.json?auth=${encodeURIComponent(env.FIREBASE_DB_SECRET.trim())}`);
          fbTest = testRes.ok ? 'connected_ok' : `firebase_http_${testRes.status}`;
        }
        return jsonResponse({ ok: true, hasUrl, hasSecret, fbTest });
      }

      if (request.method !== 'POST') return jsonResponse({ code: 'ERR_METHOD', message: 'POST only' }, 405);

      if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) {
        return jsonResponse({
          code: 'ERR_ENV_MISSING',
          message: 'متغيرات Firebase السرية (FIREBASE_DB_URL أو FIREBASE_DB_SECRET) غير مضبوطة بالاسم الصحيح في Cloudflare.'
        }, 500);
      }

      const body = await request.json().catch(() => ({}));
      const config = (await fbGet(env, 'arena_world/config')) || {};

      // أ) نقاط نهاية الإدارة المستقلة (بدون أي ارتباط بالمتجر)
      if (url.pathname === '/admin/login') {
        return await handleAdminLogin(env, body, request);
      }
      if (url.pathname === '/admin/logout') {
        return await handleAdminLogout(env, request);
      }
      if (url.pathname.startsWith('/admin/')) {
        const admAuth = await verifyAdminSession(env, request);
        if (!admAuth.ok) {
          return jsonResponse({ code: 'ERR_ADMIN_ONLY', message: `صلاحية الإدارة مطلوبة. [${admAuth.reason || 'UNAUTHORIZED'}]` }, 403);
        }
        switch (url.pathname) {
          case '/admin/dashboard':
            return await handleAdminDashboard(env, config);
          case '/admin/config':
            return await handleAdminUpdateConfig(env, body);
          case '/admin/cashout/resolve':
            return await handleAdminResolveCashout(env, body);
          case '/admin/player/unfreeze':
            return await handleAdminUnfreeze(env, body);
          case '/admin/weekly/config':
            return await handleAdminWeeklyConfig(env, body);
          case '/admin/weekly/settle':
            return await handleAdminWeeklySettle(env, body);
          case '/admin/frames/config':
            return await handleAdminFramesConfig(env, body);
          case '/admin/frames/bulk':
            return await handleAdminFramesBulk(env, body, config);
          case '/admin/broadcast':
            return await handleAdminBroadcast(env, body);
          case '/admin/player/trust':
            return await handleAdminPlayerTrust(env, body);
          case '/admin/topup/resolve':
            return await handleAdminResolveTopup(env, body);
          case '/admin/records/reset':
            return await handleAdminResetRecord(env, body);
          case '/admin/event/status':
            return await handleEventStatus(env, null);
          case '/admin/event/config':
            return await handleAdminEventConfig(env, body);
          case '/admin/event/settle':
            return await handleAdminEventSettle(env);
          case '/admin/players/list':
            return await handleAdminPlayersList(env, body);
          case '/admin/player/update':
            return await handleAdminPlayerUpdate(env, body);
          case '/admin/player/ledger':
            return await handleAdminPlayerLedger(env, body);
          case '/admin/shop/config':
            return await handleAdminShopConfig(env, body, config);
          case '/admin/game/reset-all':
            return await handleAdminResetAllGameData(env, body);
          default:
            return jsonResponse({ code: 'ERR_404', message: 'مسار إدارة غير موجود' }, 404);
        }
      }

      if (config.killSwitch === true) {
        return jsonResponse({ maintenance: true, message: 'قيد التطوير' }, 503);
      }

      // ب-0) نقطة معاينة عامة لشاشة الدخول الأول (الجوائز الأسبوعية الحية)
      if (url.pathname === '/public/preview') {
        return await handlePublicPreview(env, config);
      }

      // تم عزل المنصة بالكامل عن أي جسر خارجي


      // ج) نقاط نهاية تطبيق عالم التحديات (Arena PWA)
      if (url.pathname === '/auth/bind') {
        return await handleBindDevice(env, body, config);
      }
      if (url.pathname === '/auth/register-shared') {
        return await handleSharedRegister(env, body, config);
      }
      if (url.pathname === '/auth/login-shared') {
        return await handleSharedLogin(env, body, config);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const player = await verifyDeviceToken(env, token);
      if (!player) return jsonResponse({ code: 'ERR_AUTH_01', message: 'جلسة غير صالحة، أعد ربط الجهاز.' }, 401);
      if (player.frozen) return jsonResponse({ code: 'ERR_FROZEN', message: 'الحساب مجمد للمراجعة الأمنية.' }, 403);

      switch (url.pathname) {
        case '/player/profile':
          return await handleProfile(env, player, config);
        case '/character/select':
          return await handleSelectCharacter(env, player, body);
        case '/shop/buy':
          return await handleShopBuy(env, player, body, config);
        case '/cosmetic/equip':
          return await handleEquipCosmetic(env, player, body);
        case '/session/start':
          return await handleSessionStart(env, player, body, config);
        case '/session/submit':
          return await handleSessionSubmit(env, player, body, config);
        case '/weekly/status':
          return await handleWeeklyStatus(env, player);
        case '/pvp/list':
          return await handlePvpList(env, player, body);
        case '/pvp/bounty-leaders':
          return await handlePvpBountyLeaders(env);
        case '/pvp/cancel':
          return await handlePvpCancel(env, player, body);
        case '/pvp/prestige/equip':
          return await handleEquipPvpPrestige(env, player, body);
        case '/pvp/create':
          return await handlePvpCreate(env, player, body, config);
        case '/pvp/join':
          return await handlePvpJoin(env, player, body, config);
        case '/bridge/cashout':
          return await handleCashoutRequest(env, player, body, config);
        case '/bridge/shamcash-topup-request':
          return await handleShamCashTopupRequest(env, player, body, config);
        case '/tower/streak/claim':
          return await handleTowerStreakClaim(env, player);
        case '/tower/cosmetic/equip':
          return await handleTowerCosmeticEquip(env, player, body);
        case '/tower/taunt/open-crate':
          return await handleOpenTauntCrate(env, player, body);
        case '/tower/taunt/equip':
          return await handleEquipTaunt(env, player, body);
        case '/tower/taunt/send':
          return await handleSendTaunt(env, player, body);
        case '/player/notifications/read':
          return await handleReadNotifications(env, player);
        case '/event/status':
          return await handleEventStatus(env, player);
        default:
          return jsonResponse({ code: 'ERR_404', message: 'مسار غير موجود' }, 404);
      }
    } catch (err) {
      return jsonResponse({
        code: 'ERR_WORKER_EX',
        message: `خطأ داخلي في الخادم: ${err && err.message ? err.message : 'Unknown error'}`
      }, 500);
    }
  }
};

function normalizeDbUrl(rawUrl) {
  let u = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (u && !u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
  return u;
}

async function verifyStoreFirebaseToken(env, request) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace('Bearer ', '').trim();
  if (!idToken) return { ok: false, reason: 'NO_TOKEN_SENT' };
  if (idToken.split('.').length !== 3) return { ok: false, reason: 'BAD_TOKEN_FORMAT' };

  try {
    const baseUrl = normalizeDbUrl(env.FIREBASE_DB_URL);
    const checkRes = await fetch(`${baseUrl}/missingRequests.json?auth=${encodeURIComponent(idToken)}&shallow=true`);
    if (!checkRes.ok) return { ok: false, reason: `FB_AUTH_HTTP_${checkRes.status}` };

    const base64Url = idToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const payload = JSON.parse(atob(padded));
    const email = (payload.email || '').toLowerCase();
    if (!email) return { ok: false, reason: 'NO_EMAIL_IN_TOKEN' };
    if (!email.endsWith('@moaath.store')) return { ok: false, reason: `WRONG_DOMAIN_${email}` };

    const phone = email.split('@')[0];
    const isAdmin = email === ADMIN_EMAIL;
    return { ok: true, phone, email, isAdmin };
  } catch (e) {
    return { ok: false, reason: `EX_${e.message || 'ERR'}` };
  }
}

async function handleGenerateBindKey(env, { phone }) {
  const storeUser = await fbGet(env, `users/${phone}`);
  const displayName = (storeUser && (storeUser.name || storeUser.displayName)) || `زبون ${phone.slice(-4)}`;
  const randPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const bindKey = `MTH-${randPart()}-${randPart()}`;

  await fbPatch(env, `arena_world/bind_keys/${bindKey}`, {
    phone, displayName, used: false, createdAt: Date.now()
  });

  return jsonResponse({ ok: true, bindKey, displayName });
}

async function handleStoreToArenaTransfer(env, { phone }, { sypAmount, usdAmount, idempotencyKey }, config) {
  const sypRate = Number(config.usdToSypRate || config.sypPerUsd || 150);
  const syp = sypAmount !== undefined
    ? Number(sypAmount)
    : Math.round(Number(usdAmount || 0) * sypRate);

  if (!syp || syp <= 0 || syp > 50000000) {
    return jsonResponse({ code: 'ERR_AMT', message: 'مبلغ الشحن بالليرة السورية غير صالح.' }, 400);
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return jsonResponse({ code: 'ERR_IDEM', message: 'مفتاح منع التكرار مفقود.' }, 400);
  }

  const existingTx = await fbGet(env, `arena_world/bridge_transfers/${idempotencyKey}`);
  if (existingTx) return jsonResponse({ code: 'ERR_DUP_TX', message: 'تم تنفيذ هذه العملية مسبقاً.' }, 409);

  const storeUser = await fbGet(env, `users/${phone}`);
  const currentUsd = Number((storeUser && storeUser.prepaidBalanceUSD) || 0);
  const usdEquivalent = Number((syp / sypRate).toFixed(4));

  if (currentUsd < usdEquivalent) {
    const availableSyp = Math.floor(currentUsd * sypRate);
    return jsonResponse({
      code: 'ERR_STORE_FUNDS',
      message: `رصيدك في محفظة المتجر غير كافٍ (${availableSyp.toLocaleString('ar-SY')} ل.س تقريباً).`
    }, 400);
  }

  const coinBuyRateSYP = Number(config.buyRateSYP || 1);
  const coinToUsdRate = Number(config.coinToUsdRate || 0.01);
  const coinsToAdd = coinBuyRateSYP > 0
    ? Math.floor(syp / coinBuyRateSYP)
    : Math.floor(usdEquivalent / coinToUsdRate);

  if (coinsToAdd <= 0) {
    return jsonResponse({ code: 'ERR_RATE', message: 'المبلغ أقل من قيمة عملة واحدة أو سعر الصرف غير مضبوط.' }, 400);
  }

  const now = Date.now();
  const newStoreUsd = Number(Math.max(0, currentUsd - usdEquivalent).toFixed(4));

  await fbPatch(env, `arena_world/bridge_transfers/${idempotencyKey}`, {
    phone, direction: 'store_to_arena', sypAmount: syp, usdEquivalent, pts: coinsToAdd, status: 'processing', createdAt: now
  });
  await fbPatch(env, `users/${phone}`, { prepaidBalanceUSD: newStoreUsd });

  let player = await fbGet(env, `arena_world/players/${phone}`);
  if (!player) {
    player = {
      phone,
      displayName: (storeUser && (storeUser.name || storeUser.displayName)) || `زبون ${phone.slice(-4)}`,
      activeCharacterId: 'buddy', activeFrame: '', points: 0, verifiedCheckpointBalance: 0,
      xp: 0, wins: 0, losses: 0, winStreak: 0, recordsBroken: 0,
      inventory: {}, cosmetics: {}, shopHistory: [], frozen: false, antiCheatFlags: 0
    };
    await fbPatch(env, `arena_world/players/${phone}`, player);
  }

  await updatePlayerBalance(env, player, coinsToAdd, { txId: idempotencyKey, type: 'store_topup_syp', delta: coinsToAdd, at: now });
  await creditReferralFromApprovedTopup(env, player, coinsToAdd, idempotencyKey);
  await fbPatch(env, `arena_world/bridge_transfers/${idempotencyKey}`, { status: 'completed', completedAt: Date.now() });

  return jsonResponse({
    ok: true, addedCoins: coinsToAdd, sypAmount: syp, newArenaBalance: player.points,
    newStoreSyp: Math.floor(newStoreUsd * sypRate),
    message: `تم تحويل ${syp.toLocaleString('ar-SY')} ل.س إلى ${coinsToAdd} عملة معاذ بنجاح!`
  });
}

async function handleAdminDashboard(env, config) {
  await processDueAutoCashouts(env, config);
  const [cashouts, topups, alerts, players, adminStats, recordsRaw] = await Promise.all([
    fbGet(env, 'arena_world/pending_cashouts'),
    fbGet(env, 'arena_world/pending_topups'),
    fbGet(env, 'arena_world/admin_alerts'),
    fbGet(env, 'arena_world/players'),
    fbGet(env, 'arena_world/admin_stats'),
    fbGet(env, 'arena_world/admin_records')
  ]);
  const records = recordsRaw || {};
  const pendingTopups = topups
    ? Object.entries(topups).map(([txId, v]) => ({ txId, ...v })).filter((t) => t.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
    : [];

  const pendingCashouts = cashouts
    ? Object.entries(cashouts).map(([txId, v]) => ({ txId, ...v })).filter((c) => c.status === 'pending_audit').sort((a, b) => a.createdAt - b.createdAt)
    : [];
  const recentAlerts = alerts
    ? Object.entries(alerts).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at).slice(0, 15)
    : [];
  const frozenPlayers = players
    ? Object.values(players).filter((p) => p.frozen).map((p) => ({ phone: p.phone, displayName: p.displayName, points: p.points, flags: p.antiCheatFlags || 0 }))
    : [];

  return jsonResponse({
    ok: true,
    config: {
      killSwitch: Boolean(config.killSwitch),
      welcomePoints: Number(config.welcomePoints || 0),
      minCashoutPts: Number(config.minCashoutPts || 100),
      pvpHouseEdgePct: Number(config.pvpHouseEdgePct || 10),
      coinToUsdRate: Number(config.coinToUsdRate || (1 / Number(config.usdToSypRate || 150))),
      buyRateSYP: Number(config.buyRateSYP || 1),
      cashoutRateSYP: Number(config.cashoutRateSYP || 1),
      usdToSypRate: Number(config.usdToSypRate || 150),
      recordEntryCostPts: Number(config.recordEntryCostPts || 10),
      dynamicBoostEnabled: config.dynamicBoostEnabled !== false,
      dynamicBoostStepPts: Number(config.dynamicBoostStepPts || 100),
      dynamicBoostPctPerStep: Number(config.dynamicBoostPctPerStep || 8),
      dynamicBoostMaxPct: Number(config.dynamicBoostMaxPct || 80),
      recordDynamicBoostPct: computeDynamicBoostPct(config, 'record', Number((records.tower_match && records.tower_match.jackpotPts) || 120)),
      autoRolloverWeekly: config.autoRolloverWeekly !== false,
      autoCashoutEnabled: Boolean(config.autoCashoutEnabled),
      autoCashoutMaxPts: Number(config.autoCashoutMaxPts || 200),
      autoCashoutMinWins: Number(config.autoCashoutMinWins || 3),
      dynamicBoostEnabled: config.dynamicBoostEnabled !== false,
      dynamicBoostStepPts: Number(config.dynamicBoostStepPts || 100),
      dynamicBoostPctPerStep: Number(config.dynamicBoostPctPerStep || 8),
      dynamicBoostMaxPct: Number(config.dynamicBoostMaxPct || 80),
      minTopupSYP: Number(config.minTopupSYP || 100),
      shamCashCashoutEnabled: Boolean(config.shamCashCashoutEnabled),
      shamCashTopupEnabled: Boolean(config.shamCashTopupEnabled),
      adminShamCashId: String(config.adminShamCashId || ''),
      adminWhatsApp: String(config.adminWhatsApp || '963965461504'),
      gameEntryFees: getEffectiveGameEntryFees(config),
      lockedModes: getLockedModesConfig(config),
      broadcast: getActiveBroadcast(config)
    },
    shopCatalog: getEffectiveShopCatalog(config),
    adminProfit: (() => {
      const totalPts = Number((adminStats && adminStats.totalRevenuePts) || 0);
      const buySyp = Number(config.buyRateSYP || 1);
      const sypRate = Math.max(1, Number(config.usdToSypRate || 150));
      const totalSyp = Math.round(totalPts * buySyp);
      const totalUsd = Number((totalSyp / sypRate).toFixed(2));
      return { totalPts, totalUsd, totalSyp, referralPaidPts: Number((adminStats && adminStats.referralPaidPts) || 0), bySource: (adminStats && adminStats.bySource) || {} };
    })(),
    pendingCashouts, pendingTopups, recentAlerts, frozenPlayers,
    weeklyTournaments: await getAllWeeklySummaries(env),
    framesCatalog: getEffectiveFramesCatalog(config)
  });
}

async function handleAdminUpdateConfig(env, body) {
  const updates = {};
  if (typeof body.killSwitch === 'boolean') updates.killSwitch = body.killSwitch;
  if (body.welcomePoints !== undefined) updates.welcomePoints = Math.max(0, Number(body.welcomePoints));
  if (body.minCashoutPts !== undefined) updates.minCashoutPts = Math.max(10, Math.floor(Number(body.minCashoutPts)));
  if (body.minTopupSYP !== undefined) updates.minTopupSYP = Math.max(10, Math.floor(Number(body.minTopupSYP)));
  if (typeof body.shamCashCashoutEnabled === 'boolean') updates.shamCashCashoutEnabled = body.shamCashCashoutEnabled;
  if (typeof body.shamCashTopupEnabled === 'boolean') updates.shamCashTopupEnabled = body.shamCashTopupEnabled;
  if (body.adminShamCashId !== undefined) updates.adminShamCashId = String(body.adminShamCashId || '').trim().slice(0, 80);
  if (body.adminWhatsApp !== undefined) updates.adminWhatsApp = String(body.adminWhatsApp || '').replace(/[^0-9]/g, '').slice(0, 20);
  if (body.pvpHouseEdgePct !== undefined) updates.pvpHouseEdgePct = Math.min(30, Math.max(0, Number(body.pvpHouseEdgePct)));
  if (body.coinToUsdRate !== undefined) updates.coinToUsdRate = Math.max(0.0001, Number(body.coinToUsdRate));
  if (body.buyRateSYP !== undefined) updates.buyRateSYP = Math.max(0.1, Number(body.buyRateSYP));
  if (body.cashoutRateSYP !== undefined) {
    updates.cashoutRateSYP = Math.max(0.1, Number(body.cashoutRateSYP));
    const sypUsd = Math.max(1, Number(body.usdToSypRate || 150));
    updates.coinToUsdRate = Number((updates.cashoutRateSYP / sypUsd).toFixed(6));
  }
  if (body.usdToSypRate !== undefined) updates.usdToSypRate = Math.max(100, Number(body.usdToSypRate));
  if (body.recordEntryCostPts !== undefined) updates.recordEntryCostPts = Math.max(1, Math.floor(Number(body.recordEntryCostPts)));
  if (typeof body.autoRolloverWeekly === 'boolean') updates.autoRolloverWeekly = body.autoRolloverWeekly;
  if (typeof body.autoCashoutEnabled === 'boolean') updates.autoCashoutEnabled = body.autoCashoutEnabled;
  if (body.autoCashoutMaxPts !== undefined) updates.autoCashoutMaxPts = Math.max(100, Math.min(1000, Math.floor(Number(body.autoCashoutMaxPts))));
  if (body.autoCashoutMinWins !== undefined) updates.autoCashoutMinWins = Math.max(0, Math.floor(Number(body.autoCashoutMinWins)));
  if (typeof body.dynamicBoostEnabled === 'boolean') updates.dynamicBoostEnabled = body.dynamicBoostEnabled;
  if (body.dynamicBoostStepPts !== undefined) updates.dynamicBoostStepPts = Math.max(10, Math.floor(Number(body.dynamicBoostStepPts)));
  if (body.dynamicBoostPctPerStep !== undefined) updates.dynamicBoostPctPerStep = Math.max(0, Math.min(50, Number(body.dynamicBoostPctPerStep)));
  if (body.dynamicBoostMaxPct !== undefined) updates.dynamicBoostMaxPct = Math.max(0, Math.min(150, Number(body.dynamicBoostMaxPct)));
  if (body.gameEntryFees && typeof body.gameEntryFees === 'object') {
    const curFees = (await fbGet(env, 'arena_world/config/gameEntryFees')) || {};
    for (const gid of ['tower_match', 'hill_drive', 'cyber_shooter']) {
      if (body.gameEntryFees[gid] !== undefined) {
        curFees[gid] = Math.max(1, Math.floor(Number(body.gameEntryFees[gid]) || 10));
      }
    }
    updates.gameEntryFees = curFees;
  }
  if (body.lockedModes && typeof body.lockedModes === 'object') {
    const curLocks = (await fbGet(env, 'arena_world/config/lockedModes')) || {};
    for (const k of ['tower_match', 'hill_drive', 'cyber_shooter', 'weekly', 'pvp', 'events']) {
      if (typeof body.lockedModes[k] === 'boolean') {
        curLocks[k] = body.lockedModes[k];
      }
    }
    updates.lockedModes = curLocks;
  }
  await fbPatch(env, 'arena_world/config', updates);
  return jsonResponse({ ok: true, message: 'تم حفظ إعدادات عالم التحديات بنجاح.' });
}

async function handleAdminResolveCashout(env, { txId, action }) {
  if (!txId || !['approve', 'reject'].includes(action)) return jsonResponse({ code: 'ERR_PARAM', message: 'بيانات غير صالحة.' }, 400);
  const cashout = await fbGet(env, `arena_world/pending_cashouts/${txId}`);
  if (!cashout || cashout.status !== 'pending_audit') return jsonResponse({ code: 'ERR_TX_DONE', message: 'هذا الطلب تمت معالجته مسبقاً.' }, 400);

  const player = await fbGet(env, `arena_world/players/${cashout.phone}`);
  if (!player) return jsonResponse({ code: 'ERR_NO_PLAYER', message: 'اللاعب غير موجود.' }, 404);

  if (action === 'approve') {
    const auditOk = await verifyRollingLedger(env, player);
    if (!auditOk) {
      await flagAndFreeze(env, player, 'LEDGER_MISMATCH_ON_ADMIN_APPROVE', { txId });
      return jsonResponse({ code: 'ERR_AUDIT_FAIL', message: 'تحذير: السجل غير متطابق! تم تجميد الحساب تلقائياً.' }, 409);
    }
    if (cashout.method === 'shamcash') {
      await fbPatch(env, `arena_world/pending_cashouts/${txId}`, { status: 'approved', resolvedAt: Date.now() });
      await fbPatch(env, `arena_world/bridge_transfers/${txId}`, {
        phone: cashout.phone, direction: 'arena_to_shamcash', pts: cashout.pts, sypAmount: cashout.sypAmount || cashout.pts,
        usdAmount: cashout.usdAmount, shamCashId: cashout.shamCashId || '', status: 'completed', createdAt: Date.now()
      });
      return jsonResponse({ ok: true, message: `✅ تم اعتماد سحب شام كاش (${Number(cashout.sypAmount || cashout.pts).toLocaleString()} ل.س) للمعرّف ${cashout.shamCashId || ''}.` });
    }
    const storeUser = await fbGet(env, `users/${cashout.phone}`);
    const currentUsd = Number((storeUser && storeUser.prepaidBalanceUSD) || 0);
    const newUsd = Number((currentUsd + Number(cashout.usdAmount)).toFixed(4));

    await fbPatch(env, `users/${cashout.phone}`, { prepaidBalanceUSD: newUsd });
    await fbPatch(env, `arena_world/pending_cashouts/${txId}`, { status: 'approved', resolvedAt: Date.now() });
    await fbPatch(env, `arena_world/bridge_transfers/${txId}`, {
      phone: cashout.phone, direction: 'arena_to_store', pts: cashout.pts, usdAmount: cashout.usdAmount, status: 'completed', createdAt: Date.now()
    });
    return jsonResponse({ ok: true, message: `✅ تم اعتماد التحويل وإضافة ${Number(cashout.sypAmount || cashout.pts).toLocaleString()} ل.س (${cashout.usdAmount}$) لرصيد الزبون في المتجر.` });
  } else {
    await updatePlayerBalance(env, player, Number(cashout.pts), { txId: `ref_${txId}`, type: 'cashout_rejected_refund', delta: Number(cashout.pts), at: Date.now() });
    await fbPatch(env, `arena_world/pending_cashouts/${txId}`, { status: 'rejected', resolvedAt: Date.now() });
    return jsonResponse({ ok: true, message: 'تم رفض الطلب وإعادة النقاط لرصيد اللاعب في العالم.' });
  }
}

async function handleAdminUnfreeze(env, { phone }) {
  if (!phone) return jsonResponse({ code: 'ERR_PHONE', message: 'رقم الهاتف مطلوب.' }, 400);
  await fbPatch(env, `arena_world/players/${phone}`, { frozen: false });
  return jsonResponse({ ok: true, message: `تم فك تجميد الحساب ${phone}.` });
}

async function getPlayerUnlockedVips(env, phone) {
  const storeUser = await fbGet(env, `users/${phone}`);
  const unlocked = [];
  const now = Date.now();
  if (storeUser && storeUser.vipCharacters) {
    for (const [charId, info] of Object.entries(storeUser.vipCharacters)) {
      if (info === true || (info && (info.permanent === true || Number(info.expiresAt || 0) > now))) unlocked.push(charId);
    }
  }
  return unlocked;
}

async function handleBindDevice(env, { bindKey, deviceId, refCode }, config) {
  if (!bindKey || !deviceId) return jsonResponse({ code: 'ERR_BIND_01', message: 'بيانات ناقصة' }, 400);
  const keyData = await fbGet(env, `arena_world/bind_keys/${bindKey}`);
  if (!keyData || keyData.used) return jsonResponse({ code: 'ERR_BIND_02', message: 'المعرف غير صحيح أو مستخدم مسبقاً.' }, 403);

  const existingDevice = await fbGet(env, `arena_world/devices/${deviceId}`);
  if (existingDevice && existingDevice.phone !== keyData.phone) return jsonResponse({ code: 'ERR_MULTI_ACC', message: 'هذا الجهاز مرتبط بحساب آخر بالفعل.' }, 403);

  const deviceToken = crypto.randomUUID() + '.' + Date.now();
  await fbPatch(env, `arena_world/bind_keys/${bindKey}`, { used: true, usedAt: Date.now() });
  await fbPatch(env, `arena_world/devices/${deviceId}`, { phone: keyData.phone, token: deviceToken });

  const playerPath = `arena_world/players/${keyData.phone}`;
  const existingPlayer = await fbGet(env, playerPath);
  if (!existingPlayer) {
    const welcomePts = Number(config.welcomePoints || 0);
    const validRef = await resolveValidReferrer(env, refCode, keyData.phone, deviceId);
    await fbPatch(env, playerPath, {
      phone: keyData.phone, displayName: keyData.displayName || 'لاعب جديد', activeCharacterId: 'buddy', activeFrame: '',
      points: welcomePts, verifiedCheckpointBalance: welcomePts, xp: 0, wins: 0, losses: 0,
      winStreak: 0, recordsBroken: 0, totalRoundsPlayed: 0, referredBy: validRef, lastDeviceId: deviceId,
      inventory: {}, cosmetics: {}, shopHistory: [], frozen: false, antiCheatFlags: 0, deviceToken
    });
    if (validRef) {
      const rp = await fbGet(env, `arena_world/players/${validRef}`);
      const rStats = (rp && rp.referralStats) || {};
      await fbPatch(env, `arena_world/players/${validRef}/referralStats`, { totalCount: Number(rStats.totalCount || 0) + 1, totalEarnedPts: Number(rStats.totalEarnedPts || 0) });
    }
  } else {
    await fbPatch(env, playerPath, { deviceToken });
  }
  return jsonResponse({ ok: true, deviceToken });
}

async function handleProfile(env, player, config = {}) {
  const unlockedVips = await getPlayerUnlockedVips(env, player.phone);
  let activeChar = player.activeCharacterId || 'buddy';
  if (VIP_CHARS.includes(activeChar) && !unlockedVips.includes(activeChar)) {
    activeChar = 'buddy';
    await fbPatch(env, `arena_world/players/${player.phone}`, { activeCharacterId: 'buddy' });
  }
  const records = (await fbGet(env, 'arena_world/admin_records')) || {
    hill_drive: { title: 'قيادة التلال 2D', currentRecord: 350, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 },
    cyber_shooter: { title: 'ميجا شوتر 2D', currentRecord: 500, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 },
    tower_match: { title: 'برج التحدي اللانهائي', currentRecord: 1200, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 120 }
  };
  if (!records.tower_match) {
    records.tower_match = { title: 'برج التحدي اللانهائي', currentRecord: 1200, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 120 };
  }
  await processDueAutoCashouts(env, config);
  const towerData = getTowerPlayerData(player);
  const todayStr = new Date().toISOString().slice(0, 10);
  const canCheckInToday = towerData.lastCheckInDate !== todayStr;
  const myRefCode = await ensurePlayerRefCode(env, player);
  return jsonResponse({
    refCode: myRefCode,
    referralStats: player.referralStats || { totalCount: 0, totalEarnedPts: 0 },
    pvpPrestige: (((player.games && player.games.tower_match) || {}).prestige) || {},
    activePvpPrestige: (((player.games && player.games.tower_match) || {}).activePvpPrestige) || '',
    personalBestRecord: Number((((player.games && player.games.tower_match) || {}).personalBestRecord) || 0),
    lastAttempt: (((player.games && player.games.tower_match) || {}).lastAttempt) || null,
    pvpDefenseCatalog: PVP_DEFENSE_PRESTIGE,
    pvpStreakCatalog: PVP_STREAK_PRESTIGE,
    displayName: player.displayName,
    broadcast: getActiveBroadcast(config),
    towerData: { ...towerData, canCheckInToday },
    towerStreakCatalog: TOWER_STREAK_REWARDS,
    tauntsCatalog: TAUNTS_50,
    crateBundles: Object.values(CRATE_BUNDLES),
    playerTaunts: (((player.games && player.games.tower_match) || {}).taunts) || {},
    activeTauntId: (((player.games && player.games.tower_match) || {}).activeTauntId) || '',
    notifications: await (async () => {
      const nMap = (await fbGet(env, `arena_world/notifications/${player.phone}`)) || {};
      return Object.entries(nMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at).slice(0, 20);
    })(),
    phone: player.phone,
    activeCharacterId: activeChar,
    activeFrame: player.activeFrame || '',
    unlockedVips,
    points: player.points,
    xp: player.xp || 0,
    wins: player.wins || 0,
    losses: player.losses || 0,
    winStreak: player.winStreak || 0,
    inventory: player.inventory || {},
    cosmetics: player.cosmetics || {},
    shopHistory: Array.isArray(player.shopHistory) ? player.shopHistory.slice(0, 5) : [],
    dailyDeal: getTodayDailyDeal(),
    framesCatalog: getEffectiveFramesCatalog(config),
    economy: {
      buyRateSYP: Number(config.buyRateSYP || 1),
      cashoutRateSYP: Number(config.cashoutRateSYP || 1),
      usdToSypRate: Number(config.usdToSypRate || 150),
      coinToUsdRate: Number(config.coinToUsdRate || (1 / Number(config.usdToSypRate || 150))),
      recordEntryCostPts: Number(config.recordEntryCostPts || 10),
      dynamicBoostEnabled: config.dynamicBoostEnabled !== false,
      dynamicBoostStepPts: Number(config.dynamicBoostStepPts || 100),
      dynamicBoostPctPerStep: Number(config.dynamicBoostPctPerStep || 8),
      dynamicBoostMaxPct: Number(config.dynamicBoostMaxPct || 80),
      recordDynamicBoostPct: computeDynamicBoostPct(config, 'record', Number((records.tower_match && records.tower_match.jackpotPts) || 120)),
      autoRolloverWeekly: config.autoRolloverWeekly !== false,
      autoCashoutEnabled: Boolean(config.autoCashoutEnabled),
      autoCashoutMaxPts: Number(config.autoCashoutMaxPts || 200),
      autoCashoutMinWins: Number(config.autoCashoutMinWins || 3),
      dynamicBoostEnabled: config.dynamicBoostEnabled !== false,
      dynamicBoostStepPts: Number(config.dynamicBoostStepPts || 100),
      dynamicBoostPctPerStep: Number(config.dynamicBoostPctPerStep || 8),
      dynamicBoostMaxPct: Number(config.dynamicBoostMaxPct || 80),
      minTopupSYP: Number(config.minTopupSYP || 100),
      shamCashCashoutEnabled: Boolean(config.shamCashCashoutEnabled),
      shamCashTopupEnabled: Boolean(config.shamCashTopupEnabled),
      adminShamCashId: String(config.adminShamCashId || ''),
      adminWhatsApp: String(config.adminWhatsApp || '963965461504'),
      gameEntryFees: getEffectiveGameEntryFees(config),
      lockedModes: getLockedModesConfig(config),
      broadcast: getActiveBroadcast(config)
    },
    shopCatalog: getEffectiveShopCatalog(config),
    records
  });
}

async function handleSelectCharacter(env, player, { characterId }) {
  if (!BASIC_CHARS.includes(characterId) && !VIP_CHARS.includes(characterId)) return jsonResponse({ code: 'ERR_CHAR', message: 'شخصية غير معروفة.' }, 400);
  if (VIP_CHARS.includes(characterId)) {
    const unlockedVips = await getPlayerUnlockedVips(env, player.phone);
    if (!unlockedVips.includes(characterId)) return jsonResponse({ code: 'ERR_VIP_LOCKED', message: 'هذه الشخصية مخصصة لـ VIP، يمكنك فتحها من متجر معاذ.' }, 403);
  }
  await fbPatch(env, `arena_world/players/${player.phone}`, { activeCharacterId: characterId });
  return jsonResponse({ ok: true, activeCharacterId: characterId });
}

async function handleEquipCosmetic(env, player, { frameId }) {
  const cos = player.cosmetics || {};
  const tData = getTowerPlayerData(player);
  const ownedStreakFrame = TOWER_STREAK_REWARDS.some((r) => r.type === 'frame' && r.id === frameId && tData.claimedSteps[r.step]);
  if (frameId && !cos[frameId] && !ownedStreakFrame) {
    return jsonResponse({ code: 'ERR_FRAME_LOCKED', message: 'لم تفتح هذا الإطار بعد.' }, 403);
  }
  await fbPatch(env, `arena_world/players/${player.phone}`, { activeFrame: frameId || '' });
  return jsonResponse({ ok: true, activeFrame: frameId || '', message: frameId ? 'تم تفعيل الإطار على صورتك!' : 'تم إزالة الإطار.' });
}

async function handleShopBuy(env, player, { itemId, idempotencyKey }, config = {}) {
  const idem = await checkOrLockIdempotency(env, idempotencyKey, 'buy_' + player.phone);
  if (!idem.ok) return jsonResponse({ code: 'ERR_DUP_BUY', message: 'تم تنفيذ عملية الشراء هذه مسبقاً.' }, 409);
  const framesCat = getEffectiveFramesCatalog(config);
  const frameItem = framesCat.find((f) => f.id === itemId);
  if (frameItem) {
    const cosmetics = player.cosmetics || {};
    if (cosmetics[itemId]) {
      await fbPatch(env, `arena_world/players/${player.phone}`, { activeFrame: itemId });
      return jsonResponse({ ok: true, message: `تم تفعيل ${frameItem.name}!` });
    }
    // 1) فتح مجاني بالـ XP إذا كان الإطار يدعم XP وحقق اللاعب الحد المطلوب
    if (frameItem.reqXp > 0 && (player.xp || 0) >= frameItem.reqXp) {
      cosmetics[itemId] = true;
      await fbPatch(env, `arena_world/players/${player.phone}`, { cosmetics, activeFrame: itemId });
      return jsonResponse({ ok: true, message: `🎉 تم فتح وتفعيل ${frameItem.name} مجاناً بفضل خبرتك (XP)!` });
    }
    // 2) شراء بعملات معاذ (أو فتح مبكر) إذا كان له سعر عملات
    if (frameItem.price > 0) {
      let fPrice = frameItem.price;
      if (player.activeCharacterId === 'saver') fPrice = Math.max(1, Math.floor(fPrice * 0.95));
      if (player.points < fPrice) {
        const hintXp = frameItem.reqXp > 0 ? ` أو اجمع ${frameItem.reqXp} XP لفتحه مجاناً.` : '';
        return jsonResponse({ code: 'ERR_FUNDS', message: `رصيدك لا يكفي (${fPrice} عملة)${hintXp}` }, 400);
      }
      const now = Date.now();
      const txId = `frm_${crypto.randomUUID().slice(0, 8)}`;
      await updatePlayerBalance(env, player, -fPrice, { txId, type: `shop_buy_${itemId}`, delta: -fPrice, at: now });
      cosmetics[itemId] = true;
      const history = Array.isArray(player.shopHistory) ? player.shopHistory : [];
      history.unshift({ itemId, name: frameItem.name, price: fPrice, at: now });
      await fbPatch(env, `arena_world/players/${player.phone}`, { cosmetics, activeFrame: itemId, shopHistory: history.slice(0, 5) });
      return jsonResponse({ ok: true, finalPrice: fPrice, message: `👑 مبروك! تم شراء وتفعيل ${frameItem.name} مقابل ${fPrice} عملة!` });
    }
    return jsonResponse({ code: 'ERR_XP_LOW', message: `تحتاج إلى ${frameItem.reqXp} XP لفتح ${frameItem.name}.` }, 400);
  }

  const item = getEffectiveShopItem(itemId, config);
  if (!item) return jsonResponse({ code: 'ERR_ITEM', message: 'الغرض غير موجود في المتجر.' }, 400);

  if (item.type === 'cosmetic') {
    if ((player.xp || 0) < item.reqXp) return jsonResponse({ code: 'ERR_XP_LOW', message: `تحتاج إلى ${item.reqXp} XP لفتح هذا القالب.` }, 400);
    const cosmetics = player.cosmetics || {};
    cosmetics[itemId] = true;
    await fbPatch(env, `arena_world/players/${player.phone}`, { cosmetics, activeFrame: itemId });
    return jsonResponse({ ok: true, message: `تم فتح وتفعيل ${item.name} مجاناً!` });
  }

  let finalPrice = item.price;
  const deal = getTodayDailyDeal();
  if (deal.itemId === itemId) {
    finalPrice = Math.max(1, Math.floor(finalPrice * (1 - deal.discountPct / 100)));
  }
  if (player.activeCharacterId === 'saver') {
    finalPrice = Math.max(1, Math.floor(finalPrice * 0.95));
  }
  if (player.points < finalPrice) {
    return jsonResponse({ code: 'ERR_FUNDS', message: 'رصيد عملات معاذ غير كافٍ.' }, 400);
  }

  const now = Date.now();
  const txId = `shop_${crypto.randomUUID().slice(0, 8)}`;
  await updatePlayerBalance(env, player, -finalPrice, { txId, type: `shop_buy_${itemId}`, delta: -finalPrice, at: now });

  const inv = player.inventory || {};
  if (item.grants) {
    for (const [gId, qty] of Object.entries(item.grants)) {
      inv[gId] = (inv[gId] || 0) + Number(qty);
    }
  } else {
    inv[itemId] = (inv[itemId] || 0) + 1;
  }

  const history = Array.isArray(player.shopHistory) ? player.shopHistory : [];
  history.unshift({ itemId, name: item.name, price: finalPrice, at: now });
  const trimmedHistory = history.slice(0, 5);

  await fbPatch(env, `arena_world/players/${player.phone}`, { inventory: inv, shopHistory: trimmedHistory });
  return jsonResponse({
    ok: true,
    finalPrice,
    inventory: inv,
    shopHistory: trimmedHistory,
    message: `تم شراء ${item.name} بنجاح مقابل ${finalPrice} عملة!`
  });
}

async function handleSessionStart(env, player, { gameId, mode, stakePts, pvpMatchId, useItem, usePass, idempotencyKey }, config) {
  const idem = await checkOrLockIdempotency(env, idempotencyKey, 'ses_' + player.phone);
  if (!idem.ok) return jsonResponse(idem.cached || { code: 'ERR_DUP_REQ', message: 'تم استلام هذا الطلب مسبقاً، جاري التحميل...' }, idem.cached ? 200 : 409);
  if (!['hill_drive', 'cyber_shooter', 'tower_match'].includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير مدعومة.' }, 400);
  const playMode = mode || 'record';
  const lockErr = checkModeLock(config, gameId, playMode);
  if (lockErr) return jsonResponse({ code: 'ERR_MODE_LOCKED', message: lockErr }, 403);
  let cost = Number(stakePts) || 10;
  let usedPass = false;

  const inv = player.inventory || {};

  let weeklyCycleId = null;
  if (playMode === 'weekly') {
    const wt = await ensureWeeklyTournament(env, gameId);
    const nowTs = Date.now();
    if (wt.settled || nowTs < wt.startAt || nowTs >= wt.endAt) {
      return jsonResponse({ code: 'ERR_WEEKLY_CLOSED', message: 'البطولة الأسبوعية لهذه اللعبة غير مفتوحة حالياً.' }, 400);
    }
    cost = Math.max(1, Number(wt.entryFeePts || 10));
    weeklyCycleId = wt.cycleId;
  } else if (playMode === 'record') {
    const gFees = getEffectiveGameEntryFees(config);
    cost = Math.max(1, Number(gFees[gameId] || config.recordEntryCostPts || 10));
    if (usePass && (inv.arena_pass || 0) > 0) {
      inv.arena_pass -= 1;
      cost = 0;
      usedPass = true;
    }
  }

  if (cost < 0 || player.points < cost) return jsonResponse({ code: 'ERR_FUNDS', message: 'رصيد عملات معاذ غير كافٍ.' }, 400);

  let activeItem = null;
  if (useItem && SHOP_PRICES[useItem] && SHOP_PRICES[useItem].type === 'tactical') {
    if ((inv[useItem] || 0) > 0) {
      inv[useItem] = inv[useItem] - 1;
      activeItem = useItem;
    }
  }

  if (usedPass || activeItem) {
    await fbPatch(env, `arena_world/players/${player.phone}`, { inventory: inv });
  }

  const lockedCharId = player.activeCharacterId || 'buddy';
  const sessionId = `ses_${crypto.randomUUID()}`;
  const now = Date.now();
  const seed = Math.floor(Math.random() * 999999);

  if (cost > 0) {
    await updatePlayerBalance(env, player, -cost, { txId: sessionId, type: `entry_${playMode}`, delta: -cost, at: now });
  }

  if (playMode === 'weekly' && cost > 0) {
    const wtCur = await ensureWeeklyTournament(env, gameId);
    const nextSeedAdd = Math.floor(cost * 0.05); // 5% رصيد بداية للبطولة القادمة
    const poolAdd = Math.max(0, cost - nextSeedAdd);
    const nextPool = Number(wtCur.poolPts || 0) + poolAdd;
    const nextSeedTotal = Number(wtCur.nextWeeklySeedPts || 0) + nextSeedAdd;
    const nextEntriesCount = Number(wtCur.totalRounds || 0) + 1;
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      poolPts: nextPool,
      nextWeeklySeedPts: nextSeedTotal,
      totalRounds: nextEntriesCount
    });
  }

  if (playMode === 'record') {
    const rec = (await fbGet(env, `arena_world/admin_records/${gameId}`)) || {
      title: gameId === 'hill_drive' ? 'قيادة التلال 2D' : (gameId === 'tower_match' ? 'برج التحدي اللانهائي' : 'ميجا شوتر 2D'),
      currentRecord: gameId === 'hill_drive' ? 350 : (gameId === 'tower_match' ? 1200 : 500), holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: gameId === 'tower_match' ? 120 : 100
    };
    const jackpotAdd = cost > 0 ? Math.floor(cost * 0.75) : 0; // 75% جائزة كسر الرقم الحالي
    const adminRecShare = cost > 0 ? Math.floor(cost * 0.15) : 0; // 15% للإدارة
    const nextSeedAdd = cost > 0 ? Math.max(0, cost - jackpotAdd - adminRecShare) : 0; // 10% لبدء الرقم الجديد
    if (adminRecShare > 0) await recordAdminRevenue(env, 'record', adminRecShare);
    await fbPatch(env, `arena_world/admin_records/${gameId}`, {
      ...rec,
      jackpotPts: Number(rec.jackpotPts || 100) + jackpotAdd,
      nextSeedPts: Number(rec.nextSeedPts || 0) + nextSeedAdd
    });
  }

  await fbPatch(env, `arena_world/sessions/${sessionId}`, {
    phone: player.phone, gameId, mode: playMode, stakePts: cost, pvpMatchId: pvpMatchId || null, weeklyCycleId,
    characterId: lockedCharId, activeItem, usedPass, seed, startedAt: now, expiresAt: now + 10 * 60 * 1000, consumed: false
  });
  let dynamicBoostPct = 0;
  if (playMode === 'record') {
    const recNow = await fbGet(env, `arena_world/admin_records/${gameId}`);
    dynamicBoostPct = computeDynamicBoostPct(config, 'record', Number((recNow && recNow.jackpotPts) || 100));
  } else if (playMode === 'weekly') {
    const wtNow = await ensureWeeklyTournament(env, gameId);
    dynamicBoostPct = computeDynamicBoostPct(config, 'weekly', Number((wtNow && wtNow.poolPts) || 0));
  }
  return jsonResponse({ ok: true, sessionId, seed, activeItem, characterId: lockedCharId, dynamicBoostPct, startedAt: now });
}


// ============================================================================
// المرحلة 22: التحقق من نزاهة المسار (Move-Digest) + إجماليات الشفافية والاحتفاظ
// ============================================================================
async function computeTelemetryDigest(sessionId, score, telemetry) {
  const moves = Number((telemetry && telemetry.totalMoves) || 0);
  const floors = Number((telemetry && telemetry.floorsCleared) || 0);
  const dur = Number((telemetry && telemetry.durationSec) || 0);
  const snapsLen = Array.isArray(telemetry && telemetry.snapshots) ? telemetry.snapshots.length : 0;
  const raw = `${sessionId}|${score}|${moves}|${floors}|${dur}|${snapsLen}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('moaath_dig_' + raw));
  return Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleSessionSubmit(env, player, { sessionId, score, telemetry }, config) {
  if (!sessionId || typeof score !== 'number' || !telemetry) return jsonResponse({ code: 'ERR_SUBMIT_01', message: 'بيانات النتيجة ناقصة.' }, 400);
  const session = await fbGet(env, `arena_world/sessions/${sessionId}`);
  if (!session || session.phone !== player.phone) return jsonResponse({ code: 'ERR_SES_INVALID', message: 'جلسة غير صالحة.' }, 403);
  if (session.consumed) {
    await flagAndFreeze(env, player, 'REPLAY_ATTACK_ATTEMPT', { sessionId });
    return jsonResponse({ code: 'ERR_REPLAY', message: 'محاولة إعادة إرسال نتيجة مكررة! تم تجميد الحساب.' }, 403);
  }
  await fbPatch(env, `arena_world/sessions/${sessionId}`, { consumed: true, submittedAt: Date.now() });

  const check = validateTelemetry(session, score, telemetry);
  const moveDigest = await computeTelemetryDigest(sessionId, score, telemetry);
  if (!check.valid) {
    if (check.noFreeze) {
      return jsonResponse({ code: check.reason || 'ERR_SESSION_EXPIRED', message: check.message || 'انتهت صلاحية الجلسة بسبب التوقف الطويل، لم يتم تجميد حسابك.' }, 400);
    }
    await flagAndFreeze(env, player, check.reason, { sessionId, score, telemetry });
    return jsonResponse({ code: 'ERR_CHEAT', message: 'تم رصد تلاعب في النتيجة وتجميد الحساب وإشعار الإدارة.' }, 403);
  }

  const now = Date.now();
  const charId = session.characterId || 'buddy';
  let rewardPts = 0;
  let won = false;
  let xpGain = Math.min(50, Math.max(5, Math.floor(score / 25)));
  if (charId === 'anime_zain') xpGain *= 2;
  if (session.activeItem === 'double_xp') xpGain *= 2;
  if (charId === 'anime_ryu') xpGain = Math.floor(xpGain * 1.2);
  if (charId === 'grand_chef' || charId === 'homemaker') xpGain = Math.floor(xpGain * 1.15);

  let outcomeMsg = `تم تسجيل نتيجتك: ${score}`;

  if (session.mode === 'weekly') {
    const wt = await ensureWeeklyTournament(env, session.gameId);
    if (wt && !wt.settled && (!session.weeklyCycleId || wt.cycleId === session.weeklyCycleId)) {
      const prevEntry = await fbGet(env, `arena_world/weekly_tournaments/${session.gameId}/entries/${player.phone}`);
      const prevBest = prevEntry ? Number(prevEntry.bestScore || 0) : -1;
      const attempts = (prevEntry ? Number(prevEntry.attempts || 0) : 0) + 1;
      const isNewBest = score > prevBest;
      await fbPatch(env, `arena_world/weekly_tournaments/${session.gameId}/entries/${player.phone}`, {
        phone: player.phone,
        displayName: player.displayName,
        bestScore: isNewBest ? score : prevBest,
        achievedAt: isNewBest ? now : (prevEntry ? prevEntry.achievedAt : now),
        attempts
      });
      won = isNewBest;
      outcomeMsg = isNewBest
        ? `🏆 رقم أسبوعي جديد (${score}) في ${WEEKLY_GAME_TITLES[session.gameId] || session.gameId}! تابع ترتيبك في لوحة المتصدرين.`
        : `تم تسجيل جولتك (${score}). أعلى نتيجة لك هذا الأسبوع لا تزال (${prevBest}).`;
    } else {
      outcomeMsg = `تم تسجيل نتيجتك (${score}) بعد إغلاق دورة البطولة الأسبوعية.`;
    }
  }

  if (session.mode === 'record') {
    const rec = await fbGet(env, `arena_world/admin_records/${session.gameId}`);
    if (rec && score > Number(rec.currentRecord || 0)) {
      won = true;
      let baseJackpot = Number(rec.jackpotPts || 100);
      if (charId === 'coach_sakhr') baseJackpot += Math.min(20, Math.floor(baseJackpot * 0.1));
      rewardPts = baseJackpot;
      await updatePlayerBalance(env, player, rewardPts, { txId: `win_rec_${sessionId}`, type: 'record_broken', delta: rewardPts, at: now });
      const seededJackpot = Math.max(50, Number(rec.nextSeedPts || 0));
      const oldHolderPhone = rec.holderPhone || '';
      const activeTId = (((player.games && player.games.tower_match) || {}).activeTauntId) || '';
      const tauntObj = TAUNTS_50.find((t) => t.id === activeTId);
      await fbPatch(env, `arena_world/admin_records/${session.gameId}`, {
        currentRecord: score,
        holderName: player.displayName,
        holderPhone: player.phone,
        holderCharacterId: charId,
        jackpotPts: seededJackpot,
        nextSeedPts: 0
      });
      await fbPatch(env, `arena_world/players/${player.phone}`, { recordsBroken: (player.recordsBroken || 0) + 1 });
      if (oldHolderPhone && oldHolderPhone !== player.phone) {
        await pushPlayerNotification(env, oldHolderPhone, {
          kind: 'record_dethroned',
          title: '👑 تم تحطيم رقمك القياسي!',
          body: `انتزع ${player.displayName} الرقم القياسي (${score}) وأصبح ظله الشرير بانتظارك في البرج!`,
          tauntText: tauntObj ? tauntObj.text : '',
          opponentPhone: player.phone,
          opponentName: player.displayName
        });
      }
      await fbPatch(env, 'arena_world/config/broadcast', {
        active: true,
        text: `حطّم اللاعب ${player.displayName} الرقم القياسي السابق وحصل على ${rewardPts} عملة! انطلق الآن لانتزاع العرش!`,
        type: 'promo',
        expiresAt: now + 12 * 3600000
      });
      outcomeMsg = `🔥 مبروك! كسرت الرقم القياسي وربحت الجائزة الكبرى (${rewardPts} عملة معاذ)!`;
    } else {
      const curRec = Number(rec ? rec.currentRecord : 0);
      const diff = Math.max(0, curRec - score);
      if (curRec > 0 && diff > 0 && diff <= Math.ceil(curRec * 0.15)) {
        outcomeMsg = `🔥 قريب جداً من كسر الرقم! بقي لك ${diff} نقطة فقط لتتصدر وتفوز بالجائزة الكبرى (${rec.jackpotPts} عملة)!`;
      } else {
        outcomeMsg = `انتهت الجولة بنتيجة ${score}. الرقم القياسي الحالي: ${curRec}`;
      }
    }
  }

  if (session.mode === 'pvp_create') {
    const matchId = `pvp_${crypto.randomUUID().slice(0, 8)}`;
    const roomCode = session.isPrivate ? String(Math.floor(1000 + Math.random() * 9000)) : '';
    await fbPatch(env, `arena_world/pvp_matches/${matchId}`, {
      matchId, gameId: session.gameId, creatorPhone: player.phone, creatorName: player.displayName,
      creatorCharId: charId, creatorPrestigeId: (((player.games && player.games.tower_match) || {}).activePvpPrestige) || '',
      creatorScore: score, stakePts: session.stakePts, seed: session.seed,
      isPermanent: true, isPrivate: Boolean(session.isPrivate), roomCode,
      bountyPts: 0, defensesCount: 0, uniqueVictims: {}, activeChallenge: null,
      status: 'open', createdAt: now
    });
    outcomeMsg = `💀 تم نشر تحديك الدائم في الساحة بنتيجة (${score}) ومبلغ (${session.stakePts} عملة)! كل من يخسر ضدك سيمنحك 80% ويرفع جائزة الصيد على رأسك!`;
  }

  if (session.mode === 'pvp_join' && session.pvpMatchId) {
    const match = await fbGet(env, `arena_world/pvp_matches/${session.pvpMatchId}`);
    if (match && match.status === 'open') {
      const S = Number(match.stakePts || 0);
      const currentBounty = Number(match.bountyPts || 0);

      if (score > match.creatorScore) {
        // فوز المتحدي: 80% من مجموع ما دفعه الطرفان + كامل الـ bountyPts، و20% كاملة للإدارة
        won = true;
        const totalStakes = S * 2;
        const baseWin = Math.floor(totalStakes * 0.80);
        const adminCut = totalStakes - baseWin; // 20% كاملة للإدارة
        const totalPrize = baseWin + currentBounty;
        rewardPts = totalPrize;

        await recordAdminRevenue(env, 'pvp', adminCut);
        await updatePlayerBalance(env, player, totalPrize, { txId: `pvp_win_${match.matchId}_${now}`, type: 'pvp_bounty_win', delta: totalPrize, at: now });

        const newStreak = (player.winStreak || 0) + 1;
        const uniqueBeaten = { ...((((player.games && player.games.tower_match) || {}).pvpUniqueBeaten) || {}), [match.creatorPhone]: true };
        const prestige = { ...((((player.games && player.games.tower_match) || {}).prestige) || {}) };
        // شرط صامت لمنع تجميع الألقاب بالاتفاق: ضد 3 لاعبين مختلفين على الأقل
        if (Object.keys(uniqueBeaten).length >= 3) {
          for (const ms of PVP_STREAK_PRESTIGE) {
            if (newStreak >= ms.count && !prestige[ms.id]) {
              prestige[ms.id] = { id: ms.id, name: ms.name, rarity: ms.rarity, unlockedAt: now };
            }
          }
        }
        await fbPatch(env, `arena_world/players/${player.phone}`, { wins: (player.wins || 0) + 1, winStreak: newStreak });
        await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, { pvpUniqueBeaten: uniqueBeaten, prestige });
        await fbPatch(env, `arena_world/pvp_matches/${match.matchId}`, {
          opponentPhone: player.phone, opponentName: player.displayName, opponentScore: score,
          winnerPhone: player.phone, status: 'completed', bountyPts: 0, activeChallenge: null, completedAt: now
        });
        await pushPlayerNotification(env, match.creatorPhone, {
          kind: 'pvp_dethroned',
          title: '💥 سقط تحديك الدائم!',
          body: `هزمك ${player.displayName} (${score} مقابل ${match.creatorScore}) وحصد ${totalPrize.toLocaleString()} عملة!`
        });
        outcomeMsg = `🏆 أسطورة! هزمت ${match.creatorName} (${score} مقابل ${match.creatorScore}) وربحت ${totalPrize.toLocaleString()} عملة` + (currentBounty > 0 ? ` (منها ${currentBounty} جائزة صيد 🎯)!` : '!');
      } else if (score < match.creatorScore) {
        // خسارة المتحدي: 80% لصاحب التحدي + 10% للإدارة + 10% جائزة إضافية (bountyPts) + جمجمة 💀 ويستمر التحدي
        const creatorShare = Math.floor(S * 0.80);
        const adminShare = Math.floor(S * 0.10);
        const bountyAdd = Math.max(0, S - creatorShare - adminShare);
        const nextDefenses = Number(match.defensesCount || 0) + 1;
        const nextBounty = currentBounty + bountyAdd;
        const nextVictims = { ...(match.uniqueVictims || {}), [player.phone]: true };

        await recordAdminRevenue(env, 'pvp', adminShare);
        const creator = await fbGet(env, `arena_world/players/${match.creatorPhone}`);
        if (creator) {
          await updatePlayerBalance(env, creator, creatorShare, { txId: `pvp_def_${match.matchId}_${now}`, type: 'pvp_defense_win', delta: creatorShare, at: now });
          const cPrestige = { ...((((creator.games && creator.games.tower_match) || {}).prestige) || {}) };
          // شرط صامت: 3 لاعبين مختلفين على الأقل لفتح الأدوات الفخرية الأسطورية للدفاع
          if (Object.keys(nextVictims).length >= 3) {
            for (const dm of PVP_DEFENSE_PRESTIGE) {
              if (nextDefenses >= dm.count && !cPrestige[dm.id]) {
                cPrestige[dm.id] = { id: dm.id, name: dm.name, rarity: dm.rarity, unlockedAt: now };
              }
            }
          }
          await fbPatch(env, `arena_world/players/${creator.phone}`, { wins: (creator.wins || 0) + 1 });
          await fbPatch(env, `arena_world/players/${creator.phone}/games/tower_match`, { prestige: cPrestige });
          await pushPlayerNotification(env, creator.phone, {
            kind: 'pvp_defense',
            title: `💀 ضحية جديدة (#${nextDefenses}) في تحديك الدائم!`,
            body: `خسر ${player.displayName} ضدك! أُضيف لرصيدك +${creatorShare} عملة وارتفعت جائزة صيدك إلى ${nextBounty} عملة.`
          });
        }

        await fbPatch(env, `arena_world/pvp_matches/${match.matchId}`, {
          defensesCount: nextDefenses, bountyPts: nextBounty, uniqueVictims: nextVictims,
          activeChallenge: null, lastBattleAt: now
        });

        const inv = player.inventory || {};
        let newStreak = 0;
        let streakProtected = false;
        if ((player.winStreak || 0) > 0 && (inv.streak_shield || 0) > 0) {
          inv.streak_shield -= 1;
          newStreak = player.winStreak;
          streakProtected = true;
          await fbPatch(env, `arena_world/players/${player.phone}`, { losses: (player.losses || 0) + 1, winStreak: newStreak, inventory: inv });
        } else {
          await fbPatch(env, `arena_world/players/${player.phone}`, { losses: (player.losses || 0) + 1, winStreak: 0 });
        }
        if (match.gameId === 'tower_match') {
          await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, {
            lastPvpLoss: {
              opponentPhone: match.creatorPhone,
              opponentName: match.creatorName || 'منافس',
              gameId: match.gameId,
              stakePts: S,
              scoreDiff: Math.max(1, Number(match.creatorScore) - score),
              at: now
            }
          });
        }
        outcomeMsg = `💀 خسرت أمام التحدي الدائم (${score} مقابل ${match.creatorScore}). ارتفعت جائزة صيده إلى ${nextBounty} عملة!` + (streakProtected ? ' (🔥 بطاقة حماية السلسلة حفظت سلسلتك!)' : '');
      } else {
        // تعادل: إعادة مبلغ المتحدي وفك قفل المنافسة
        await updatePlayerBalance(env, player, S, { txId: `pvp_draw_${match.matchId}_${now}`, type: 'pvp_draw_refund', delta: S, at: now });
        await fbPatch(env, `arena_world/pvp_matches/${match.matchId}`, { activeChallenge: null });
        outcomeMsg = `تعادل مثير (${score} مقابل ${match.creatorScore})! تم إرجاع مبلغك (${S} عملة) وبقي التحدي مفتوحاً.`;
      }
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (!won && session.mode !== 'pvp_create' && charId === 'butler_farid' && player.lastCashbackDay !== todayKey) {
    const cashback = Math.max(1, Math.floor(Number(session.stakePts || 0) * 0.1));
    await updatePlayerBalance(env, player, cashback, { txId: `cb_${sessionId}`, type: 'vip_cashback', delta: cashback, at: now });
    await fbPatch(env, `arena_world/players/${player.phone}`, { lastCashbackDay: todayKey });
    outcomeMsg += ` (السيد فريد أعاد لك ${cashback} عملة Cashback!)`;
  }

  const nextRounds = Number(player.totalRoundsPlayed || 0) + 1;
  player.totalRoundsPlayed = nextRounds;
  await fbPatch(env, `arena_world/players/${player.phone}`, { xp: (player.xp || 0) + xpGain, totalRoundsPlayed: nextRounds });
  await releasePendingReferralIfEligible(env, player);
  let streakUpdate = null;
  if (session.gameId === 'tower_match') {
    const prevBestRec = Number((((player.games && player.games.tower_match) || {}).personalBestRecord) || 0);
    const updTower = { lastAttempt: { mode: session.mode, score, won, at: now } };
    if (session.mode === 'record' && score > prevBestRec) updTower.personalBestRecord = score;
    await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, updTower);
    streakUpdate = await runAutomaticTowerStreakForPlayer(env, player);
  }
  const isPvpWinForEvent = (session.mode === 'pvp_join' && won) ? 1 : 0;
  await recordAdminEventProgress(env, player, {
    score: Number(score || 0),
    bossesDefeated: Number((telemetry && telemetry.bossesDefeated) || 0),
    pvpWin: isPvpWinForEvent
  });
  return jsonResponse({ ok: true, won, score, rewardPts, xpGain, streakUpdate, moveDigest, message: outcomeMsg });
}

function validateTelemetry(session, score, telemetry) {
  const serverElapsedSec = (Date.now() - session.startedAt) / 1000;
  const clientElapsedSec = Number(telemetry.durationSec || 0);

  if (serverElapsedSec < 2) {
    return { valid: false, reason: 'TIME_TAMPERING_DETECTED' };
  }
  // إذا غاب اللاعب في الخلفية (مثلاً للرد على واتساب) لأكثر من 30 دقيقة، تُرفض الجلسة دون تجميد الحساب
  if (serverElapsedSec > 1800) {
    return { valid: false, noFreeze: true, reason: 'ERR_SESSION_EXPIRED', message: 'انتهت مهلة الجلسة بسبب البقاء طويلاً خارج التطبيق. يمكنك بدء جولة جديدة بأمان.' };
  }
  if (score < 0 || !Array.isArray(telemetry.snapshots) || telemetry.snapshots.length === 0) {
    return { valid: false, reason: 'MISSING_TELEMETRY_SNAPSHOTS' };
  }

  if (session.gameId === 'tower_match') {
    // في برج التحدي يتوقف عداد العميل أثناء نافذة الزعيم ودليل البداية وشاشة النتيجة،
    // لذا يُسمح بأن يكون زمن الخادم أكبر من زمن اللعب الفعلي، لكن يُمنع تماماً أن يدّعي العميل زمناً أكبر من زمن الخادم.
    if (clientElapsedSec < 2 || clientElapsedSec > serverElapsedSec + 10) {
      return { valid: false, reason: 'TIME_TAMPERING_DETECTED' };
    }
    // نعتمد الزمن الفعلي الأصغر لحساب السقف حتى لا يستغل الغشاش التوقف المؤقت لرفع السقف المسموح
    const effectiveSec = Math.min(serverElapsedSec, Math.max(clientElapsedSec, 2));
    const moves = Number(telemetry.totalMoves || 0);
    const floors = Number(telemetry.floorsCleared || 0);
    const maxAllowedMoves = Math.ceil(effectiveSec * 4.5) + 8;
    const maxAllowedFloors = Math.ceil(effectiveSec * 1.1) + 4;
    const maxAllowedScore = Math.ceil(effectiveSec * 380) + (floors * 650) + 1200;

    if (score > 500 && moves < 2) {
      return { valid: false, reason: 'TOWER_ZERO_MOVES_CHEAT' };
    }
    if (score > maxAllowedScore || moves > maxAllowedMoves || floors > maxAllowedFloors) {
      return { valid: false, reason: 'TOWER_MATCH_SCORE_ANOMALY' };
    }
    return { valid: true };
  }

  // يُمنع أن يدّعي العميل زمناً أكبر من زمن الخادم، أما التوقف في الخلفية (واتساب) فلا يُعد غشاً
  if (clientElapsedSec < 2 || clientElapsedSec > serverElapsedSec + 15) {
    return { valid: false, reason: 'TIME_TAMPERING_DETECTED' };
  }
  if (session.gameId === 'hill_drive' && score > Math.ceil(serverElapsedSec * 45) + 50) {
    return { valid: false, reason: 'HILL_DRIVE_SPEEDHACK' };
  }
  if (session.gameId === 'cyber_shooter' && (score > Math.ceil(serverElapsedSec * 60) + 60 || Number(telemetry.kills || 0) > Math.ceil(serverElapsedSec * 3.5))) {
    return { valid: false, reason: 'SHOOTER_SCORE_ANOMALY' };
  }
  return { valid: true };
}

async function handlePvpBountyLeaders(env) {
  const matches = (await fbGet(env, 'arena_world/pvp_matches')) || {};
  const leaders = Object.values(matches)
    .filter((m) => m && (Number(m.bountyPts || 0) > 0 || Number(m.defensesCount || 0) > 0))
    .sort((a, b) => (Number(b.bountyPts || 0) - Number(a.bountyPts || 0)) || (Number(b.defensesCount || 0) - Number(a.defensesCount || 0)))
    .slice(0, 5)
    .map((m) => ({
      creatorName: m.creatorName,
      creatorCharId: m.creatorCharId || 'buddy',
      bountyPts: Number(m.bountyPts || 0),
      defensesCount: Number(m.defensesCount || 0)
    }));
  return jsonResponse({ ok: true, leaders });
}

async function handlePvpList(env, player = null, body = {}) {
  const now = Date.now();
  const filterCode = String((body && body.roomCode) || '').trim();
  const matches = (await fbGet(env, 'arena_world/pvp_matches')) || {};
  const openList = Object.values(matches)
    .filter((m) => {
      if (!m || m.status !== 'open') return false;
      if (m.isPrivate) {
        return Boolean(filterCode && String(m.roomCode || '') === filterCode) || Boolean(player && m.creatorPhone === player.phone);
      }
      return true;
    })
    .map((m) => {
      const inBattle = Boolean(m.activeChallenge && Number(m.activeChallenge.expiresAt || 0) > now);
      return {
        matchId: m.matchId,
        gameId: m.gameId,
        creatorName: m.creatorName,
        creatorCharId: m.creatorCharId || 'buddy',
        creatorPhone: m.creatorPhone || '',
        creatorPrestigeId: m.creatorPrestigeId || '',
        stakePts: Number(m.stakePts || 0),
        bountyPts: Number(m.bountyPts || 0),
        defensesCount: Number(m.defensesCount || 0),
        inBattle,
        isMine: Boolean(player && m.creatorPhone === player.phone),
        createdAt: Number(m.createdAt || 0)
      };
    })
    .sort((a, b) => (b.bountyPts - a.bountyPts) || (b.defensesCount - a.defensesCount) || (b.createdAt - a.createdAt))
    .slice(0, 30);
  return jsonResponse({ ok: true, matches: openList });
}

async function handlePvpCreate(env, player, body, config) {
  const lockErr = checkModeLock(config, body && body.gameId, 'pvp_create');
  if (lockErr) return jsonResponse({ code: 'ERR_MODE_LOCKED', message: lockErr }, 403);
  return handleSessionStart(env, player, { gameId: body.gameId, mode: 'pvp_create', stakePts: Number(body.stakePts || 20), useItem: body.useItem, isPrivate: Boolean(body.isPrivate), idempotencyKey: body.idempotencyKey }, config);
}

async function handlePvpJoin(env, player, { matchId, useItem, idempotencyKey }, config) {
  const lockErr = checkModeLock(config, null, 'pvp_join');
  if (lockErr) return jsonResponse({ code: 'ERR_MODE_LOCKED', message: lockErr }, 403);
  const now = Date.now();
  const match = await fbGet(env, `arena_world/pvp_matches/${matchId}`);
  if (!match || match.status !== 'open') return jsonResponse({ code: 'ERR_PVP_CLOSED', message: 'هذا التحدي لم يعد متاحاً.' }, 400);
  if (match.creatorPhone === player.phone) return jsonResponse({ code: 'ERR_PVP_SELF', message: 'لا يمكنك قبول تحديك الخاص.' }, 400);
  if (match.activeChallenge && Number(match.activeChallenge.expiresAt || 0) > now && match.activeChallenge.phone !== player.phone) {
    return jsonResponse({ code: 'ERR_PVP_BUSY', message: '⚔️ هذا التحدي في منافسة حالياً مع لاعب آخر، حاول بعد لحظات!' }, 409);
  }
  const sesRes = await handleSessionStart(env, player, { gameId: match.gameId, mode: 'pvp_join', stakePts: match.stakePts, pvpMatchId: matchId, useItem, idempotencyKey }, config);
  if (sesRes.status === 200) {
    await fbPatch(env, `arena_world/pvp_matches/${matchId}`, {
      activeChallenge: { phone: player.phone, startedAt: now, expiresAt: now + 10 * 60 * 1000 }
    });
  }
  return sesRes;
}

async function handlePvpCancel(env, player, { matchId }) {
  const now = Date.now();
  const match = await fbGet(env, `arena_world/pvp_matches/${matchId}`);
  if (!match || match.status !== 'open') return jsonResponse({ code: 'ERR_PVP_CLOSED', message: 'التحدي مغلق بالفعل.' }, 400);
  if (match.creatorPhone !== player.phone) return jsonResponse({ code: 'ERR_FORBIDDEN', message: 'لا تملك صلاحية إلغاء هذا التحدي.' }, 403);
  if (match.activeChallenge && Number(match.activeChallenge.expiresAt || 0) > now) {
    return jsonResponse({ code: 'ERR_PVP_BUSY', message: 'لا يمكن إلغاء التحدي أثناء وجود منافس يلعب ضده حالياً!' }, 409);
  }
  const S = Number(match.stakePts || 0);
  const refund = Math.floor(S * 0.50);
  const adminTake = (S - refund) + Number(match.bountyPts || 0);

  await fbPatch(env, `arena_world/pvp_matches/${matchId}`, { status: 'cancelled', bountyPts: 0, activeChallenge: null, cancelledAt: now });
  if (refund > 0) {
    await updatePlayerBalance(env, player, refund, { txId: `pvp_can_${matchId}`, type: 'pvp_cancel_refund_50pct', delta: refund, at: now });
  }
  if (adminTake > 0) {
    await recordAdminRevenue(env, 'pvp_cancel', adminTake);
  }
  return jsonResponse({ ok: true, refund, message: `تم إلغاء التحدي الدائم واسترداد 50% (${refund.toLocaleString()} عملة) إلى رصيدك.` });
}

async function updatePlayerBalance(env, player, delta, ledgerEntry) {
  const newPts = Number(player.points || 0) + delta;
  player.points = newPts;
  await fbPatch(env, `arena_world/players/${player.phone}`, { points: newPts });
  await appendDailyLedgerAndPrune(env, player, ledgerEntry);
}

async function appendDailyLedgerAndPrune(env, player, entry) {
  const dayKey = new Date().toISOString().slice(0, 10);
  await fbPatch(env, `arena_world/ledger/${player.phone}/${dayKey}/${entry.txId}`, entry);
  const days = await fbGet(env, `arena_world/ledger/${player.phone}`);
  if (!days) return;
  const sortedDays = Object.keys(days).sort();
  if (sortedDays.length > ROLLING_LEDGER_DAYS) {
    const oldestDay = sortedDays[0];
    let dayNet = 0;
    for (const txKey of Object.keys(days[oldestDay])) dayNet += Number(days[oldestDay][txKey].delta || 0);
    const newCheckpoint = Number(player.verifiedCheckpointBalance || 0) + dayNet;
    await fbPatch(env, `arena_world/players/${player.phone}`, { verifiedCheckpointBalance: newCheckpoint, lastPrunedDay: oldestDay });
    await fbDelete(env, `arena_world/ledger/${player.phone}/${oldestDay}`);
  }
}

async function verifyRollingLedger(env, player) {
  const days = await fbGet(env, `arena_world/ledger/${player.phone}`);
  let sumDelta = 0;
  if (days) {
    for (const dayKey of Object.keys(days)) {
      for (const txKey of Object.keys(days[dayKey])) sumDelta += Number(days[dayKey][txKey].delta || 0);
    }
  }
  return (Number(player.verifiedCheckpointBalance || 0) + sumDelta) === Number(player.points);
}

async function handleCashoutRequest(env, player, { tierPts, method, shamCashId }, config) {
  const pts = Math.floor(Number(tierPts || 0));
  const minCashout = Math.max(10, Number(config.minCashoutPts || 100));
  const payMethod = method === 'shamcash' ? 'shamcash' : 'store';
  if (payMethod === 'shamcash' && !config.shamCashCashoutEnabled) {
    return jsonResponse({ code: 'ERR_DISABLED', message: 'السحب عبر شام كاش غير مفعّل حالياً من الإدارة.' }, 403);
  }
  const cleanShamId = String(shamCashId || '').trim().slice(0, 80);
  if (payMethod === 'shamcash' && cleanShamId.length < 4) {
    return jsonResponse({ code: 'ERR_SHAM_ID', message: 'يرجى إدخال معرّف شام كاش صحيح.' }, 400);
  }
  if (!pts || pts < minCashout || pts > 5000000) {
    return jsonResponse({ code: 'ERR_TIER', message: `الحد الأدنى للسحب هو ${minCashout.toLocaleString()} عملة (ل.س).` }, 400);
  }
  if (player.points < pts) return jsonResponse({ code: 'ERR_FUNDS', message: 'الرصيد غير كافٍ.' }, 400);

  const auditOk = await verifyRollingLedger(env, player);
  if (!auditOk) {
    await flagAndFreeze(env, player, 'LEDGER_MISMATCH_ON_CASHOUT', { actual: player.points });
    return jsonResponse({ code: 'ERR_AUDIT_FAIL', message: 'تم تجميد الحساب تلقائياً لعدم تطابق السجل.' }, 403);
  }

  const txId = `cash_${crypto.randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const cashoutSypRate = Math.max(0.1, Number(config.cashoutRateSYP || 1));
  const sypAmount = Math.round(pts * cashoutSypRate);
  const sypRate = Math.max(1, Number(config.usdToSypRate || 150));
  const usdAmount = Number((sypAmount / sypRate).toFixed(4));
  await updatePlayerBalance(env, player, -pts, { txId, type: `cashout_pending_${payMethod}`, delta: -pts, at: now });
  const isTrusted = Boolean(player.trusted) || (Number(player.wins || 0) >= Number(config.autoCashoutMinWins || 3) && Number(player.antiCheatFlags || 0) === 0 && !player.frozen);
  const autoEligible = payMethod === 'store' && Boolean(config.autoCashoutEnabled) && isTrusted && pts <= Number(config.autoCashoutMaxPts || 200);
  await fbPatch(env, `arena_world/pending_cashouts/${txId}`, {
    phone: player.phone, displayName: player.displayName || '', pts, sypAmount, usdAmount,
    method: payMethod, shamCashId: payMethod === 'shamcash' ? cleanShamId : '',
    status: 'pending_audit', autoEligible, createdAt: now, releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });
  return jsonResponse({
    ok: true, txId, pts, sypAmount, usdAmount, method: payMethod,
    shamCashId: cleanShamId, autoEligible, createdAt: now, releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });
}

async function flagAndFreeze(env, player, reason, details) {
  await fbPatch(env, `arena_world/players/${player.phone}`, { frozen: true, antiCheatFlags: (player.antiCheatFlags || 0) + 1 });
  await fbPatch(env, `arena_world/admin_alerts/${Date.now()}`, { phone: player.phone, reason, details, at: Date.now() });
}

async function verifyDeviceToken(env, token) {
  if (!token) return null;
  const players = await fbGet(env, 'arena_world/players');
  if (!players) return null;
  for (const phone of Object.keys(players)) {
    if (players[phone].deviceToken === token) return players[phone];
  }
  return null;
}

async function fbGet(env, path) {
  const baseUrl = normalizeDbUrl(env.FIREBASE_DB_URL);
  const secret = encodeURIComponent(String(env.FIREBASE_DB_SECRET || '').trim());
  const res = await fetch(`${baseUrl}/${path}.json?auth=${secret}`);
  return res.ok ? res.json() : null;
}
async function fbPatch(env, path, data) {
  const baseUrl = normalizeDbUrl(env.FIREBASE_DB_URL);
  const secret = encodeURIComponent(String(env.FIREBASE_DB_SECRET || '').trim());
  return fetch(`${baseUrl}/${path}.json?auth=${secret}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
}
async function fbDelete(env, path) {
  const baseUrl = normalizeDbUrl(env.FIREBASE_DB_URL);
  const secret = encodeURIComponent(String(env.FIREBASE_DB_SECRET || '').trim());
  return fetch(`${baseUrl}/${path}.json?auth=${secret}`, { method: 'DELETE' });
}
function jsonResponse(data, status = 200) {
  return corsResponse(JSON.stringify(data), status, { 'Content-Type': 'application/json' });
}
function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  });
}


// ============================================================================
// منظومة البطولات الأسبوعية المستقلة لكل لعبة (0% ذكاء اصطناعي — حتمية 100%)
// ============================================================================
async function ensureWeeklyTournament(env, gameId) {
  let wt = await fbGet(env, `arena_world/weekly_tournaments/${gameId}`);
  const now = Date.now();
  if (!wt || !wt.cycleId) {
    const endAt = now + 7 * 24 * 60 * 60 * 1000;
    wt = {
      gameId,
      title: WEEKLY_GAME_TITLES[gameId] || gameId,
      cycleId: `wk_${gameId}_${now}`,
      entryFeePts: 10,
      startAt: now,
      endAt,
      poolPts: 0,
      totalRounds: 0,
      settled: false,
      entries: {}
    };
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, wt);
  }
  return wt;
}

function buildWeeklyLeaderboard(entriesMap, playersMap) {
  const arr = Object.values(entriesMap || {}).filter((e) => {
    if (!e || !e.phone) return false;
    const p = playersMap && playersMap[e.phone];
    return !(p && p.frozen);
  });
  // الترتيب: الأعلى نتيجة، وعند التعادل الأسبق زمنياً
  arr.sort((a, b) => (Number(b.bestScore || 0) - Number(a.bestScore || 0)) || (Number(a.achievedAt || 0) - Number(b.achievedAt || 0)));
  return arr;
}

function computePrizeBreakdown(poolPts) {
  const pool = Math.max(0, Number(poolPts || 0));
  const adminShare = Math.floor(pool * WEEKLY_ADMIN_PCT);
  const rankPrizes = WEEKLY_RANK_SPLITS.map((pct) => Math.floor(pool * pct));
  return { pool, adminShare, rankPrizes };
}

async function settleWeeklyTournamentIfDue(env, gameId, force = false) {
  const wt = await ensureWeeklyTournament(env, gameId);
  const now = Date.now();
  if (wt.settled) return { settledNow: false, wt };
  if (!force && now < Number(wt.endAt || 0)) return { settledNow: false, wt };

  // قفل فوري لمنع التكرار (Idempotent Lock)
  await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, { settled: true, settledAt: now });
  wt.settled = true;

  const playersMap = (await fbGet(env, 'arena_world/players')) || {};
  const board = buildWeeklyLeaderboard(wt.entries, playersMap);
  const { pool, adminShare, rankPrizes } = computePrizeBreakdown(wt.poolPts);

  let distributed = 0;
  const winners = [];

  for (let i = 0; i < Math.min(7, board.length); i++) {
    const entry = board[i];
    const prize = rankPrizes[i] || 0;
    if (prize <= 0) continue;
    const p = playersMap[entry.phone];
    if (!p || p.frozen) continue;

    await updatePlayerBalance(env, p, prize, {
      txId: `wk_${wt.cycleId}_r${i + 1}`,
      type: `weekly_prize_${gameId}_rank_${i + 1}`,
      delta: prize,
      at: now
    });
    distributed += prize;
    winners.push({ rank: i + 1, phone: entry.phone, displayName: entry.displayName, score: entry.bestScore, prize });
  }

  const rolloverOrHouse = Math.max(0, pool - distributed);
  await fbPatch(env, `arena_world/weekly_history/${wt.cycleId}`, {
    gameId, cycleId: wt.cycleId, poolPts: pool, adminShare, distributed, rolloverOrHouse, winners, settledAt: now
  });

  await recordAdminRevenue(env, 'weekly', adminShare);
  const cfg = (await fbGet(env, 'arena_world/config')) || {};
  if (cfg.autoRolloverWeekly !== false) {
    const nextCycleId = `wk_${gameId}_${now + 1000}`;
    const durDays = Math.max(1, Number(wt.durationDays || 7));
    const nextEnd = now + durDays * 24 * 60 * 60 * 1000;
    const seedStart = Number(wt.nextWeeklySeedPts || 0);
    await fbDelete(env, `arena_world/weekly_tournaments/${gameId}/entries`);
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      gameId, title: WEEKLY_GAME_TITLES[gameId] || gameId, cycleId: nextCycleId,
      entryFeePts: Number(wt.entryFeePts || 10), durationDays: durDays, startAt: now, endAt: nextEnd,
      poolPts: seedStart, nextWeeklySeedPts: 0, totalRounds: 0, settled: false
    });
  }
  return { settledNow: true, wt, winners, pool, adminShare, distributed };
}

async function getAllWeeklySummaries(env, currentPhone = null) {
  const playersMap = (await fbGet(env, 'arena_world/players')) || {};
  const result = {};
  for (const gId of WEEKLY_GAMES) {
    await settleWeeklyTournamentIfDue(env, gId, false);
    const wt = await ensureWeeklyTournament(env, gId);
    const board = buildWeeklyLeaderboard(wt.entries, playersMap);
    const { pool, adminShare, rankPrizes } = computePrizeBreakdown(wt.poolPts);

    const top7 = board.slice(0, 7).map((e, idx) => {
      const pObj = playersMap && playersMap[e.phone];
      const rankBadgeLabels = ['👑 متصدر الأسبوع #1', '🥈 وصيف الأسبوع #2', '🥉 ثالث الأسبوع #3', '🏅 رابع الأسبوع #4', '🏅 خامس الأسبوع #5', '🏅 سادس الأسبوع #6', '🏅 سابع الأسبوع #7'];
      return {
        rank: idx + 1,
        rankBadge: rankBadgeLabels[idx] || `#${idx + 1}`,
        displayName: e.displayName,
        bestScore: e.bestScore,
        prizePts: rankPrizes[idx] || 0,
        characterId: (pObj && pObj.activeCharacterId) || 'buddy',
        activeFrame: (pObj && pObj.activeFrame) || '',
        isMe: currentPhone ? e.phone === currentPhone : false
      };
    });

    let myRank = null, myBest = 0;
    if (currentPhone) {
      const idx = board.findIndex((e) => e.phone === currentPhone);
      if (idx >= 0) { myRank = idx + 1; myBest = board[idx].bestScore; }
    }

    const now = Date.now();
    const status = wt.settled ? 'settled' : (now < wt.startAt ? 'scheduled' : (now >= wt.endAt ? 'ended' : 'active'));

    result[gId] = {
      gameId: gId,
      title: WEEKLY_GAME_TITLES[gId] || gId,
      cycleId: wt.cycleId,
      entryFeePts: Number(wt.entryFeePts || 10),
      startAt: Number(wt.startAt || 0),
      endAt: Number(wt.endAt || 0),
      status,
      settled: Boolean(wt.settled),
      poolPts: pool,
      nextWeeklySeedPts: Number(wt.nextWeeklySeedPts || 0),
      durationDays: Number(wt.durationDays || 7),
      totalRounds: Number(wt.totalRounds || 0),
      adminShare,
      rankPrizes,
      top7,
      myRank,
      myBest
    };
  }
  return result;
}

async function handleWeeklyStatus(env, player) {
  const cfg = (await fbGet(env, 'arena_world/config')) || {};
  const lm = getLockedModesConfig(cfg);
  if (lm.weekly) return jsonResponse({ code: 'ERR_MODE_LOCKED', message: 'البطولة الأسبوعية مغلقة مؤقتاً من الإدارة.' }, 403);
  const tournaments = await getAllWeeklySummaries(env, player.phone);
  return jsonResponse({ ok: true, tournaments });
}

async function handleAdminWeeklyConfig(env, { gameId, entryFeePts, startAt, endAt, durationDays, resetCycle }) {
  if (!WEEKLY_GAMES.includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير صالحة.' }, 400);
  const fee = Math.max(1, Number(entryFeePts || 10));
  const durDays = Math.max(1, Math.min(60, Math.round(Number(durationDays || ((Number(endAt || 0) - Number(startAt || 0)) / 86400000) || 7))));
  const sAt = Number(startAt || Date.now());
  const eAt = Number(endAt || (sAt + durDays * 24 * 60 * 60 * 1000));
  if (eAt <= sAt) return jsonResponse({ code: 'ERR_DATES', message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.' }, 400);

  if (resetCycle) {
    const wtOld = await ensureWeeklyTournament(env, gameId);
    const seedStart = Number((wtOld && wtOld.nextWeeklySeedPts) || 0);
    const newCycleId = `wk_${gameId}_${Date.now()}`;
    await fbDelete(env, `arena_world/weekly_tournaments/${gameId}/entries`);
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      gameId, title: WEEKLY_GAME_TITLES[gameId], cycleId: newCycleId,
      entryFeePts: fee, durationDays: durDays, startAt: sAt, endAt: eAt,
      poolPts: seedStart, nextWeeklySeedPts: 0, totalRounds: 0, settled: false
    });
    return jsonResponse({ ok: true, message: `تم بدء دورة جديدة (${durDays} يوم) للعبة ${WEEKLY_GAME_TITLES[gameId]} برصيد بداية ${seedStart} عملة!` });
  } else {
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      entryFeePts: fee, durationDays: durDays, startAt: sAt, endAt: eAt
    });
    return jsonResponse({ ok: true, message: `تم تحديث إعدادات بطولة ${WEEKLY_GAME_TITLES[gameId]} (${durDays} يوم) بنجاح.` });
  }
}

async function handleAdminWeeklySettle(env, { gameId }) {
  if (!WEEKLY_GAMES.includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير صالحة.' }, 400);
  const res = await settleWeeklyTournamentIfDue(env, gameId, true);
  if (!res.settledNow) return jsonResponse({ code: 'ERR_ALREADY', message: 'تمت تسوية هذه الدورة مسبقاً.' }, 400);
  return jsonResponse({ ok: true, message: `تم توزيع جوائز ${WEEKLY_GAME_TITLES[gameId]} (${res.distributed} عملة لـ ${res.winners.length} فائزين).` });
}


async function handlePublicPreview(env, config) {
  const summaries = await getAllWeeklySummaries(env, null);
  let totalWeeklyPool = 0;
  for (const g of WEEKLY_GAMES) totalWeeklyPool += Number(summaries[g]?.poolPts || 0);
  return jsonResponse({
    ok: true,
    totalWeeklyPool,
    welcomePoints: Number(config.welcomePoints || 0),
    tournaments: summaries
  });
}

async function handleBridgeStoreInfo(env, { phone }, config) {
  const [storeUser, arenaPlayer, summaries] = await Promise.all([
    fbGet(env, `users/${phone}`),
    fbGet(env, `arena_world/players/${phone}`),
    getAllWeeklySummaries(env, phone)
  ]);
  const usdToSypRate = Number(config.usdToSypRate || 150);
  const buyRateSYP = Number(config.buyRateSYP || 1);
  const storeUsd = Number((storeUser && storeUser.prepaidBalanceUSD) || 0);
  const availableSyp = Math.floor(storeUsd * usdToSypRate);
  let totalWeeklyPool = 0;
  for (const g of WEEKLY_GAMES) totalWeeklyPool += Number(summaries[g]?.poolPts || 0);

  return jsonResponse({
    ok: true,
    availableSyp,
    storeUsd,
    buyRateSYP,
    usdToSypRate,
    arenaPoints: Number((arenaPlayer && arenaPlayer.points) || 0),
    totalWeeklyPool
  });
}

async function handleAdminFramesConfig(env, { frameId, price, reqXp }) {
  const valid = DEFAULT_FRAMES_CATALOG.some((f) => f.id === frameId);
  if (!valid) return jsonResponse({ code: 'ERR_FRAME', message: 'معرّف الإطار غير صالح.' }, 400);
  const cleanPrice = Math.max(0, Math.floor(Number(price) || 0));
  const cleanXp = Math.max(0, Math.floor(Number(reqXp) || 0));
  await fbPatch(env, `arena_world/config/frameOverrides/${frameId}`, {
    price: cleanPrice,
    reqXp: cleanXp
  });
  return jsonResponse({ ok: true, message: `تم تحديث تسعيرة الإطار (${cleanPrice} عملة / ${cleanXp} XP) بنجاح.` });
}


// ============================================================================
// المرحلة 3: مسار 360 يوماً لبرج التحدي + الإعلانات + تعديل الإطارات الجماعي + التوثيق
// ============================================================================
async function handleTowerStreakClaim(env, player) {
  const tData = getTowerPlayerData(player);
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);
  const twoDaysAgoStr = new Date(now - 2 * 86400000).toISOString().slice(0, 10);

  let streakDays = tData.streakDays;
  let checkedInNow = false;
  let shieldUsed = false;

  if (tData.lastCheckInDate !== todayStr) {
    checkedInNow = true;
    if (!tData.lastCheckInDate || tData.lastCheckInDate === yesterdayStr) {
      streakDays = Math.min(360, streakDays + 1);
    } else if (tData.lastCheckInDate === twoDaysAgoStr) {
      // نافذة سماح ذكية 48 ساعة لحماية اللاعب من انقطاع الإنترنت
      streakDays = Math.min(360, streakDays + 1);
    } else {
      const inv = player.inventory || {};
      if ((inv.streak_shield || 0) > 0) {
        inv.streak_shield -= 1;
        shieldUsed = true;
        streakDays = Math.min(360, streakDays + 1);
        await fbPatch(env, `arena_world/players/${player.phone}`, { inventory: inv });
      } else {
        streakDays = 1;
      }
    }
  }

  const claimedSteps = { ...tData.claimedSteps };
  const titles = { ...tData.titles };
  const badges = { ...tData.badges };
  const cos = { ...(player.cosmetics || {}) };
  const newlyUnlocked = [];

  for (const r of TOWER_STREAK_REWARDS) {
    if (streakDays >= r.day && !claimedSteps[r.step]) {
      claimedSteps[r.step] = now;
      if (r.type === 'title') titles[r.id] = r.name;
      if (r.type === 'badge') badges[r.id] = { name: r.name, file: r.file };
      if (r.type === 'frame') {
        cos[r.id] = true;
        if (r.bonusTitle) titles['title_tower_legend'] = r.bonusTitle;
      }
      newlyUnlocked.push(r);
    }
  }

  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, {
    streakDays,
    lastCheckInDate: todayStr,
    claimedSteps,
    titles,
    badges
  });
  if (newlyUnlocked.some((x) => x.type === 'frame')) {
    await fbPatch(env, `arena_world/players/${player.phone}`, { cosmetics: cos });
  }

  return jsonResponse({
    ok: true,
    checkedInNow,
    shieldUsed,
    streakDays,
    newlyUnlocked,
    message: newlyUnlocked.length > 0
      ? `🎉 تهانينا! وصلت لليوم ${streakDays} وفتحت ${newlyUnlocked.length} مكافأة حصرية لبرج التحدي!`
      : (checkedInNow ? `🔥 تم تسجيل حضورك! سلسلتك الحالية في البرج: ${streakDays} يوماً.` : `✅ تم تسجيل حضورك اليوم مسبقاً (السلسلة: ${streakDays} يوماً).`)
  });
}

async function handleTowerCosmeticEquip(env, player, { titleId, badgeId }) {
  const tData = getTowerPlayerData(player);
  const updates = {};
  if (titleId !== undefined) {
    if (titleId && !tData.titles[titleId]) return jsonResponse({ code: 'ERR_LOCKED', message: 'لم تفتح هذا اللقب بعد.' }, 403);
    updates.activeTitle = titleId ? tData.titles[titleId] : '';
  }
  if (badgeId !== undefined) {
    if (badgeId && !tData.badges[badgeId]) return jsonResponse({ code: 'ERR_LOCKED', message: 'لم تفتح هذه الشارة بعد.' }, 403);
    updates.activeBadge = badgeId || '';
  }
  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, updates);
  return jsonResponse({ ok: true, ...updates, message: 'تم تحديث مظهرك في برج التحدي بنجاح!' });
}

async function handleAdminBroadcast(env, { text, type, hours, clear }) {
  if (clear) {
    await fbPatch(env, 'arena_world/config/broadcast', { active: false, text: '', expiresAt: 0 });
    return jsonResponse({ ok: true, message: 'تم إخفاء شريط الإعلانات بنجاح.' });
  }
  const cleanText = String(text || '').trim().slice(0, 180);
  if (!cleanText) return jsonResponse({ code: 'ERR_TEXT', message: 'أدخل نص الإعلان أولاً.' }, 400);
  const durHours = Math.max(1, Math.min(168, Number(hours || 24)));
  await fbPatch(env, 'arena_world/config/broadcast', {
    active: true,
    text: cleanText,
    type: ['info', 'promo', 'warn'].includes(type) ? type : 'promo',
    expiresAt: Date.now() + durHours * 3600000
  });
  return jsonResponse({ ok: true, message: `تم نشر الإعلان الفوري لمدة ${durHours} ساعة.` });
}

async function handleAdminFramesBulk(env, { percentDelta }, config) {
  const pct = Number(percentDelta || 0);
  if (!pct || pct < -80 || pct > 200) return jsonResponse({ code: 'ERR_PCT', message: 'نسبة التعديل غير صالحة (-80% إلى +200%).' }, 400);
  const mult = 1 + pct / 100;
  const current = getEffectiveFramesCatalog(config);
  const updates = {};
  for (const f of current) {
    const newPrice = f.price > 0 ? Math.max(5, Math.round(f.price * mult)) : 0;
    updates[f.id] = { price: newPrice, reqXp: f.reqXp };
  }
  await fbPatch(env, 'arena_world/config/frameOverrides', updates);
  return jsonResponse({ ok: true, message: `تم تعديل أسعار جميع الإطارات الـ 15 بنسبة (${pct > 0 ? '+' : ''}${pct}%) بنجاح.` });
}

async function handleAdminPlayerTrust(env, { phone, trusted }) {
  if (!phone) return jsonResponse({ code: 'ERR_PHONE', message: 'رقم الهاتف مطلوب.' }, 400);
  await fbPatch(env, `arena_world/players/${phone}`, { trusted: Boolean(trusted) });
  return jsonResponse({ ok: true, message: trusted ? `تم توثيق الحساب ${phone} للسحب التلقائي الصغير.` : `تم إلغاء توثيق الحساب ${phone}.` });
}


// ============================================================================
// معالجات صناديق الاستفزاز الـ 50 والإشعارات في المرحلة 4
// ============================================================================
async function handleOpenTauntCrate(env, player, { crateId }) {
  const crate = CRATE_BUNDLES[crateId];
  if (!crate) return jsonResponse({ code: 'ERR_CRATE', message: 'صندوق غير معروف.' }, 400);
  if (Number(player.points || 0) < crate.price) {
    return jsonResponse({ code: 'ERR_FUNDS', message: `تحتاج إلى ${crate.price} عملة لفتح ${crate.name}.` }, 400);
  }
  const now = Date.now();
  const txId = `crt_${crypto.randomUUID().slice(0, 8)}`;
  await updatePlayerBalance(env, player, -crate.price, { txId, type: `open_${crateId}`, delta: -crate.price, at: now });

  // سحب حتمي قائم على البصمة الزمنية والرصيد دون أي تدخل للذكاء الاصطناعي
  const seedNum = (now % 10000) + Number(player.points || 0) + crate.price;
  let pickedRarity = crate.rarity;
  if (crateId === 'crate_basic') {
    const roll = seedNum % 100;
    pickedRarity = roll < 70 ? 'common' : (roll < 92 ? 'rare' : (roll < 98.5 ? 'epic' : 'legendary'));
  } else if (crateId === 'crate_epic') {
    const roll = seedNum % 100;
    pickedRarity = roll < 15 ? 'rare' : (roll < 82 ? 'epic' : 'legendary');
  }

  const pool = TAUNTS_50.filter((t) => t.rarity === pickedRarity);
  const chosen = pool[seedNum % pool.length] || TAUNTS_50[0];

  const tData = getTowerPlayerData(player);
  const taunts = { ...(tData.taunts || {}) };
  const alreadyOwned = Boolean(taunts[chosen.id]);
  taunts[chosen.id] = { id: chosen.id, rarity: chosen.rarity, text: chosen.text, unlockedAt: now };

  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, {
    taunts,
    activeTauntId: chosen.id
  });

  return jsonResponse({
    ok: true,
    crateName: crate.name,
    taunt: chosen,
    alreadyOwned,
    message: alreadyOwned
      ? `تم فتح ${crate.name} وتجهيز الاستفزاز (${chosen.text})`
      : `🎉 مبروك! حصلت على استفزاز (${TAUNT_RARITIES[chosen.rarity]?.label}): «${chosen.text}»`
  });
}

async function handleEquipTaunt(env, player, { tauntId }) {
  const tData = getTowerPlayerData(player);
  const taunts = tData.taunts || {};
  if (tauntId && !taunts[tauntId]) {
    return jsonResponse({ code: 'ERR_LOCKED', message: 'لا تملك بطاقة الاستفزاز هذه.' }, 403);
  }
  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, { activeTauntId: tauntId || '' });
  return jsonResponse({ ok: true, activeTauntId: tauntId || '', message: 'تم تجهيز بطاقة الاستفزاز!' });
}

async function handleSendTaunt(env, player, { targetPhone, tauntId }) {
  if (!targetPhone || !tauntId) return jsonResponse({ code: 'ERR_PARAM', message: 'بيانات الاستفزاز ناقصة.' }, 400);
  const tData = getTowerPlayerData(player);
  const owned = (tData.taunts || {})[tauntId];
  if (!owned) return jsonResponse({ code: 'ERR_LOCKED', message: 'افتتح بطاقة الاستفزاز من المتجر أولاً.' }, 403);
  await pushPlayerNotification(env, targetPhone, {
    kind: 'taunt_received',
    title: `😏 استفزاز من ${player.displayName}`,
    body: `«${owned.text}»`,
    opponentPhone: player.phone,
    opponentName: player.displayName
  });
  return jsonResponse({ ok: true, message: `تم إرسال الاستفزاز إلى ${player.displayName ? targetPhone : 'المنافس'}!` });
}

async function handleReadNotifications(env, player) {
  await fbPatch(env, `arena_world/notifications/${player.phone}`, {});
  return jsonResponse({ ok: true });
}


// ============================================================================
// المرحلة 5: شحن شام كاش بواتساب + التسجيل والدخول المشترك مع متجر معاذ (0% AI)
// ============================================================================
async function handleShamCashTopupRequest(env, player, { sypAmount }, config) {
  if (!config.shamCashTopupEnabled) {
    return jsonResponse({ code: 'ERR_DISABLED', message: 'شحن شام كاش غير مفعّل حالياً من الإدارة.' }, 403);
  }
  const minTopup = Math.max(10, Number(config.minTopupSYP || 100));
  const syp = Math.floor(Number(sypAmount || 0));
  if (!syp || syp < minTopup || syp > 5000000) {
    return jsonResponse({ code: 'ERR_AMT', message: `الحد الأدنى للشحن هو ${minTopup.toLocaleString()} ل.س.` }, 400);
  }

  // حماية ضد الإغراق: حد أقصى طلبين معلقين لكل لاعب
  const existing = (await fbGet(env, 'arena_world/pending_topups')) || {};
  const myPending = Object.values(existing).filter((t) => t && t.phone === player.phone && t.status === 'pending');
  if (myPending.length >= 2) {
    return jsonResponse({ code: 'ERR_LIMIT', message: 'لديك طلبان معلقان بالفعل. يرجى انتظار اعتماد الإدارة.' }, 429);
  }

  const buyRate = Math.max(1, Number(config.buyRateSYP || 1));
  const coins = Math.floor(syp / buyRate);
  const txId = `SC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const now = Date.now();
  await fbPatch(env, `arena_world/pending_topups/${txId}`, {
    txId, phone: player.phone, displayName: player.displayName || '',
    sypAmount: syp, coins, method: 'shamcash', status: 'pending', createdAt: now
  });

  const adminShamId = String(config.adminShamCashId || '');
  const adminWa = String(config.adminWhatsApp || '963965461504');
  const waText = `🏆 طلب شحن عالم تحديات معاذ (شام كاش)\nرقم الطلب: ${txId}\nاللاعب: ${player.displayName || 'لاعب'} (${player.phone})\nالمبلغ المحوّل: ${syp.toLocaleString()} ل.س\nالعملات المطلوبة: ${coins.toLocaleString()} عملة\n(مرفق إشعار التحويل)`;

  return jsonResponse({
    ok: true, txId, sypAmount: syp, coins, adminShamCashId: adminShamId,
    adminWhatsApp: adminWa, waUrl: `https://wa.me/${adminWa}?text=${encodeURIComponent(waText)}`,
    createdAt: now
  });
}


async function handleAdminResetRecord(env, { gameId, newRecordScore, newJackpotPts }) {
  if (!['tower_match', 'hill_drive', 'cyber_shooter'].includes(gameId)) {
    return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير صالحة.' }, 400);
  }
  const defaults = {
    tower_match: { title: 'برج التحدي اللانهائي', score: 250, jackpot: 120 },
    hill_drive: { title: 'قيادة التلال 2D', score: 150, jackpot: 100 },
    cyber_shooter: { title: 'ميجا شوتر 2D', score: 200, jackpot: 100 }
  };
  const def = defaults[gameId];
  const scoreVal = Math.max(10, Math.floor(Number(newRecordScore !== undefined ? newRecordScore : def.score)));
  const curRec = (await fbGet(env, `arena_world/admin_records/${gameId}`)) || {};
  const jackVal = newJackpotPts !== undefined ? Math.max(20, Math.floor(Number(newJackpotPts))) : Math.max(50, Number(curRec.jackpotPts || def.jackpot));
  await fbPatch(env, `arena_world/admin_records/${gameId}`, {
    title: curRec.title || def.title,
    currentRecord: scoreVal,
    holderName: 'إدارة العالم',
    holderPhone: '',
    holderCharacterId: 'buddy',
    jackpotPts: jackVal,
    nextSeedPts: 0,
    resetAt: Date.now()
  });
  return jsonResponse({ ok: true, gameId, currentRecord: scoreVal, jackpotPts: jackVal, message: `✅ تم تصفير وضبط الرقم القياسي (${scoreVal}) بنجاح!` });
}

async function handleAdminResolveTopup(env, { txId, action }) {
  if (!txId || !['approve', 'reject'].includes(action)) return jsonResponse({ code: 'ERR_PARAM', message: 'بيانات غير صالحة.' }, 400);
  const topup = await fbGet(env, `arena_world/pending_topups/${txId}`);
  if (!topup || topup.status !== 'pending') return jsonResponse({ code: 'ERR_TX_DONE', message: 'تمت معالجة طلب الشحن مسبقاً.' }, 400);

  if (action === 'approve') {
    const player = await fbGet(env, `arena_world/players/${topup.phone}`);
    if (!player) return jsonResponse({ code: 'ERR_NO_PLAYER', message: 'اللاعب غير موجود.' }, 404);
    await fbPatch(env, `arena_world/pending_topups/${txId}`, { status: 'approved', resolvedAt: Date.now() });
    await updatePlayerBalance(env, player, Number(topup.coins || 0), {
      txId, type: 'shamcash_topup_approved', delta: Number(topup.coins || 0), at: Date.now()
    });
    await creditReferralFromApprovedTopup(env, player, Number(topup.coins || 0), txId);
    return jsonResponse({ ok: true, message: `✅ تم اعتماد الشحن وإضافة ${topup.coins} عملة للاعب ${topup.phone}.` });
  } else {
    await fbPatch(env, `arena_world/pending_topups/${txId}`, { status: 'rejected', resolvedAt: Date.now() });
    return jsonResponse({ ok: true, message: 'تم رفض طلب الشحن.' });
  }
}

async function hashPass(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('moaath_salt_' + String(str || '')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleSharedRegister(env, { name, phone, password, deviceId, refCode }, config) {
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanPass = String(password || '').trim();
  if (cleanPhone.length < 8 || cleanName.length < 2 || cleanPass.length < 4 || !deviceId) {
    return jsonResponse({ code: 'ERR_REG', message: 'يرجى إدخال الاسم، رقم هاتف صحيح، وكلمة مرور (4 أحرف على الأقل).' }, 400);
  }
  const existingUser = await fbGet(env, `users/${cleanPhone}`);
  if (existingUser && existingUser.arenaPassHash) {
    return jsonResponse({ code: 'ERR_EXISTS', message: 'هذا الرقم مسجل مسبقاً، استخدم تبويب تسجيل الدخول.' }, 409);
  }
  const passHash = await hashPass(cleanPass);
  const now = Date.now();
  await fbPatch(env, `users/${cleanPhone}`, {
    name: cleanName, phone: cleanPhone, arenaPassHash: passHash,
    prepaidBalanceUSD: Number((existingUser && existingUser.prepaidBalanceUSD) || 0),
    createdAt: (existingUser && existingUser.createdAt) || now
  });

  const deviceToken = crypto.randomUUID() + '.' + now;
  await fbPatch(env, `arena_world/devices/${deviceId}`, { phone: cleanPhone, token: deviceToken });
  const existingPlayer = await fbGet(env, `arena_world/players/${cleanPhone}`);
  if (!existingPlayer) {
    const welcomePts = Number(config.welcomePoints || 0);
    const validRef = await resolveValidReferrer(env, refCode, cleanPhone, deviceId);
    await fbPatch(env, `arena_world/players/${cleanPhone}`, {
      phone: cleanPhone, displayName: cleanName, activeCharacterId: 'buddy', activeFrame: '',
      points: welcomePts, verifiedCheckpointBalance: welcomePts, xp: 0, wins: 0, losses: 0,
      winStreak: 0, recordsBroken: 0, totalRoundsPlayed: 0, referredBy: validRef, lastDeviceId: deviceId,
      inventory: {}, cosmetics: {}, shopHistory: [], frozen: false, antiCheatFlags: 0, deviceToken
    });
    if (validRef) {
      const rp = await fbGet(env, `arena_world/players/${validRef}`);
      const rStats = (rp && rp.referralStats) || {};
      await fbPatch(env, `arena_world/players/${validRef}/referralStats`, { totalCount: Number(rStats.totalCount || 0) + 1, totalEarnedPts: Number(rStats.totalEarnedPts || 0) });
    }
  } else {
    await fbPatch(env, `arena_world/players/${cleanPhone}`, { displayName: cleanName, deviceToken });
  }
  return jsonResponse({ ok: true, deviceToken, message: '🎉 تم إنشاء حسابك المشترك بين متجر معاذ وعالم التحديات بنجاح!' });
}

async function handleSharedLogin(env, { phone, password, deviceId }, config) {
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
  const cleanPass = String(password || '').trim();
  if (cleanPhone.length < 8 || !cleanPass || !deviceId) {
    return jsonResponse({ code: 'ERR_LOGIN', message: 'أدخل رقم الهاتف وكلمة المرور.' }, 400);
  }
  const storeUser = await fbGet(env, `users/${cleanPhone}`);
  if (!storeUser || !storeUser.arenaPassHash) {
    return jsonResponse({ code: 'ERR_NOT_FOUND', message: 'الحساب غير مسجل بكلمة مرور. استخدم «تسجيل جديد» أو «معرف الربط السري».' }, 404);
  }
  const rlPath = `arena_world/login_rl/${cleanPhone}`;
  const rl = (await fbGet(env, rlPath)) || { count: 0, resetAt: 0 };
  const nowRl = Date.now();
  if (rl.count >= 5 && nowRl < Number(rl.resetAt || 0)) {
    const mins = Math.max(1, Math.ceil((rl.resetAt - nowRl) / 60000));
    return jsonResponse({ code: 'ERR_RATE_LIMIT', message: `تم إيقاف المحاولات مؤقتاً لحماية حسابك. حاول بعد ${mins} دقيقة.` }, 429);
  }
  const passHash = await hashPass(cleanPass);
  if (passHash !== storeUser.arenaPassHash) {
    const nextCnt = nowRl >= Number(rl.resetAt || 0) ? 1 : (Number(rl.count || 0) + 1);
    await fbPatch(env, rlPath, { count: nextCnt, resetAt: nowRl + 15 * 60 * 1000 });
    return jsonResponse({ code: 'ERR_BAD_PASS', message: 'كلمة المرور غير صحيحة.' }, 403);
  }
  if (rl.count > 0) await fbPatch(env, rlPath, { count: 0, resetAt: 0 });
  const deviceToken = crypto.randomUUID() + '.' + Date.now();
  await fbPatch(env, `arena_world/devices/${deviceId}`, { phone: cleanPhone, token: deviceToken });
  const existingPlayer = await fbGet(env, `arena_world/players/${cleanPhone}`);
  if (!existingPlayer) {
    const welcomePts = Number(config.welcomePoints || 0);
    await fbPatch(env, `arena_world/players/${cleanPhone}`, {
      phone: cleanPhone, displayName: storeUser.name || `لاعب ${cleanPhone.slice(-4)}`, activeCharacterId: 'buddy', activeFrame: '',
      points: welcomePts, verifiedCheckpointBalance: welcomePts, xp: 0, wins: 0, losses: 0,
      winStreak: 0, recordsBroken: 0, inventory: {}, cosmetics: {}, shopHistory: [], frozen: false, antiCheatFlags: 0, deviceToken
    });
  } else {
    await fbPatch(env, `arena_world/players/${cleanPhone}`, { deviceToken });
  }
  return jsonResponse({ ok: true, deviceToken, message: '✅ أهلاً بعودتك إلى عالم تحديات معاذ!' });
}


async function handleEquipPvpPrestige(env, player, { prestigeId }) {
  const owned = (((player.games && player.games.tower_match) || {}).prestige) || {};
  if (prestigeId && !owned[prestigeId]) {
    return jsonResponse({ code: 'ERR_LOCKED', message: 'لم تفتح هذا الوسام الفخري بعد.' }, 403);
  }
  await fbPatch(env, `arena_world/players/${player.phone}/games/tower_match`, {
    activePvpPrestige: prestigeId || ''
  });
  return jsonResponse({ ok: true, activePvpPrestige: prestigeId || '', message: prestigeId ? '🏆 تم تجهيز وسامك الفخري في ساحة PvP!' : 'تم إزالة الوسام الفخري.' });
}


// ============================================================================
// المرحلة 24: نظام أحداث تحدي الإدارة الكامل (25 مناسبة + تحكم الإدارة + جوائز + شارات وإطارات حصرية)
// ============================================================================
const ADMIN_EVENT_OCCASIONS_25 = [
  { id: 'occ_01_grand_opening', name: 'الافتتاح الرسمي لعالم تحديات معاذ', kind: 'highest_score', rules: 'حقق أعلى نتيجة منفردة في برج التحدي خلال فترة الحدث لتعتلي منصة الحدث وتفوز بالجائزة الثابتة والشارة والإطار الحصري.' },
  { id: 'occ_02_ramadan_nights', name: 'ليالي رمضان المبارك', kind: 'cumulative_score', rules: 'اجمع أعلى مجموع نقاط تراكمي عبر جولاتك خلال ليالي رمضان المبارك لتتصدر لوحة الصدارة وتنال المكافأة.' },
  { id: 'occ_03_eid_fitr', name: 'مهرجان عيد الفطر السعيد', kind: 'highest_score', rules: 'سجّل أعلى رقم قياسي خلال أيام العيد لتحصد المكافأة المالية الثابتة وشارة وإطار عيد الفطر الحصري.' },
  { id: 'occ_04_eid_adha', name: 'مهرجان عيد الأضحى المبارك', kind: 'pvp_wins', rules: 'حقق أكبر عدد من الانتصارات في تحديات 1 ضد 1 خلال فترة الحدث لتفوز بالمركز الأول والمكافأة الحصرية.' },
  { id: 'occ_05_hijri_new_year', name: 'رأس السنة الهجرية', kind: 'bosses_defeated', rules: 'اهزم أكبر عدد من زعماء البرج خلال فترة الحدث لتربح المكافأة المالية والشارة والإطار الخاص بالسنة الهجرية.' },
  { id: 'occ_06_gregorian_new_year', name: 'رأس السنة الميلادية', kind: 'highest_score', rules: 'حقق أعلى نتيجة في جولة واحدة مع انطلاق العام الجديد لتفوز بالجائزة الثابتة وشارة الحدث.' },
  { id: 'occ_07_school_season', name: 'انطلاق الموسم الدراسي الجديد', kind: 'cumulative_score', rules: 'أثبت تركيزك واجمع أعلى مجموع نقاط خلال فترة الحدث لتفوز بالمكافأة المالية واللقب والشارة الخاصة.' },
  { id: 'occ_08_exams_focus', name: 'تحدي التركيز والسرعة (موسم الاختبارات)', kind: 'highest_score', rules: 'أعلى نتيجة بأعلى دقة وسرعة خلال فترة الحدث تفوز بالصدارة والمكافأة الثابتة.' },
  { id: 'occ_09_spring_fest', name: 'مهرجان الربيع الذهبي', kind: 'bosses_defeated', rules: 'تجاوز أكبر عدد من الزعماء في البرج خلال فترة الربيع لتحصد المكافأة والشارة الحصرية.' },
  { id: 'occ_10_summer_arena', name: 'بطولة الصيف الكبرى', kind: 'pvp_wins', rules: 'حقق أكبر رصيد من انتصارات PvP خلال بطولة الصيف لتنتزع الجائزة الكبرى والشارة.' },
  { id: 'occ_11_national_day', name: 'اليوم الوطني / يوم التأسيس', kind: 'highest_score', rules: 'حقق أعلى رقم خلال الاحتفالية الوطنية لتحصل على المكافأة المالية والشارة والإطار الخاص.' },
  { id: 'occ_12_store_anniversary', name: 'ذكرى تأسيس متجر معاذ', kind: 'cumulative_score', rules: 'اجمع أعلى نقاط خلال احتفالية متجر معاذ لتنال المكافأة المالية الثابتة وشارة الذكرى.' },
  { id: 'occ_13_record_breakers', name: 'أسبوع كاسري الأرقام القياسية', kind: 'highest_score', rules: 'سجّل أعلى نتيجة خلال أسبوع كسر الأرقام لتكون بطل الحدث وتستلم المكافأة والشارة.' },
  { id: 'occ_14_combo_masters', name: 'بطولة أسياد الكومبو', kind: 'highest_score', rules: 'أعلى نتيجة متحققة عبر سلاسل الكومبو والضربات المتتالية خلال فترة الحدث.' },
  { id: 'occ_15_bounty_hunters', name: 'سباق صيّادي الجماجم والمكافآت', kind: 'pvp_wins', rules: 'حقق أكبر عدد من الانتصارات في ساحة PvP لصيد الجوائز والجماجم خلال فترة الحدث.' },
  { id: 'occ_16_boss_slayers', name: 'تحدي قاهرة الزعماء', kind: 'bosses_defeated', rules: 'اهزم أكبر عدد ممكن من زعماء الطوابق خلال فترة الحدث لتفوز بالصدارة والمكافأة.' },
  { id: 'occ_17_overdrive_week', name: 'أسبوع السرعة القصوى', kind: 'highest_score', rules: 'أعلى نتيجة في جولة واحدة خلال أسبوع السرعة القصوى لتحصد المكافأة والشارة.' },
  { id: 'occ_18_titans_clash', name: 'صراع العمالقة (مبالغ التحدي الكبرى)', kind: 'pvp_wins', rules: 'تفوّق في أكبر عدد من مواجهات التحدي خلال فترة الحدث لتفوز بالجائزة الثابتة.' },
  { id: 'occ_19_rising_stars', name: 'تحدي النجوم الصاعدة', kind: 'cumulative_score', rules: 'اجمع أعلى نقاط تراكمية خلال فترة التحدي لتثبت حضورك وتفوز بالمكافأة والشارة.' },
  { id: 'occ_20_weekend_royale', name: 'نهاية الأسبوع الملكية', kind: 'highest_score', rules: 'سجّل أعلى نتيجة خلال نهاية الأسبوع الملكية لتفوز بالمكافأة الثابتة وشارة التتويج.' },
  { id: 'occ_21_crowning_night', name: 'ليلة التتويج الكبرى', kind: 'highest_score', rules: 'أعلى نتيجة خلال فترة الحدث تُتوّج صاحبها بالمكافأة المالية والشارة والإطار الخاص.' },
  { id: 'occ_22_friends_cup', name: 'كأس الأصدقاء والتحديات', kind: 'pvp_wins', rules: 'حقق أكبر عدد من الانتصارات التنافسية خلال فترة الكأس لتفوز بالجائزة والشارة.' },
  { id: 'occ_23_double_rewards_fest', name: 'مهرجان الجوائز والمكافآت', kind: 'cumulative_score', rules: 'اجمع أعلى نقاط خلال أيام المهرجان لتحصد المكافأة المالية الثابتة وشارة الحدث.' },
  { id: 'occ_24_throne_guardians', name: 'بطولة حراس العرش', kind: 'bosses_defeated', rules: 'اهزم أكبر عدد من الزعماء في البرج خلال فترة البطولة لتفوز بالمركز الأول والشارة.' },
  { id: 'occ_25_season_finale', name: 'الحدث الختامي للموسم', kind: 'highest_score', rules: 'أعلى نتيجة في الحدث الختامي للموسم تمنح الفائز المكافأة الكبرى وشارة وإطار الختام الأسطوري.' }
];

function buildEventBadgeAsset(eventNumber) {
  const num = Math.max(1, Math.floor(Number(eventNumber || 1)));
  const modIdx = ((num - 1) % 6) + 1;
  return {
    badgeId: `event_badge_${num}`,
    frameId: `event_frame_${num}`,
    badgeName: `شارة الحدث #${num}`,
    frameName: `إطار الحدث #${num}`,
    badgeFile: `./assets/event_badges/event_badge_0${modIdx}.png`,
    frameFile: `./assets/tower_match/streak/frame_streak_0${modIdx}_${['copper','silver','ruby','dragon','phoenix','galaxy'][modIdx - 1]}.png`,
    anim: ['fx-copper','fx-silver','fx-ruby','fx-dragon','fx-phoenix','fx-galaxy'][modIdx - 1]
  };
}

async function ensureAdminEvent(env) {
  let evObj = await fbGet(env, 'arena_world/admin_event');
  const now = Date.now();
  if (!evObj || !evObj.eventId) {
    const occ = ADMIN_EVENT_OCCASIONS_25[0];
    const ex = buildEventBadgeAsset(1);
    evObj = {
      eventId: `evt_1_${now}`,
      eventNumber: 1,
      enabled: false, // يُقفل أو يُفعّل من غرفة الإدارة في متجر معاذ
      occasionId: occ.id,
      title: occ.name,
      kind: occ.kind,
      rulesText: occ.rules,
      bannerUrl: './game_tower.png',
      fixedRewardPts: 1000,
      durationDays: 7,
      startAt: now,
      endAt: now + 7 * 86400000,
      exclusiveBadgeId: ex.badgeId,
      exclusiveBadgeName: ex.badgeName,
      exclusiveBadgeFile: ex.badgeFile,
      exclusiveFrameId: ex.frameId,
      exclusiveFrameName: ex.frameName,
      exclusiveFrameFile: ex.frameFile,
      exclusiveAnim: ex.anim,
      settled: false,
      winners: [],
      entries: {}
    };
    await fbPatch(env, 'arena_world/admin_event', evObj);
  }
  return evObj;
}

function getEventMetricValue(evObj, entry, scoreDelta, bossesDelta, pvpWinDelta) {
  const cur = Number((entry && entry.metricValue) || 0);
  const kind = (evObj && evObj.kind) || 'highest_score';
  if (kind === 'highest_score') return Math.max(cur, Number(scoreDelta || 0));
  if (kind === 'cumulative_score') return cur + Number(scoreDelta || 0);
  if (kind === 'bosses_defeated') return cur + Number(bossesDelta || 0);
  if (kind === 'pvp_wins') return cur + Number(pvpWinDelta || 0);
  return Math.max(cur, Number(scoreDelta || 0));
}

async function recordAdminEventProgress(env, player, { score = 0, bossesDefeated = 0, pvpWin = 0 }) {
  if (!player || player.frozen) return;
  const evObj = await ensureAdminEvent(env);
  if (!evObj.enabled || evObj.settled) return;
  const now = Date.now();
  if (now < Number(evObj.startAt || 0) || now >= Number(evObj.endAt || 0)) return;

  const prev = (evObj.entries && evObj.entries[player.phone]) || null;
  const nextVal = getEventMetricValue(evObj, prev, score, bossesDefeated, pvpWin);
  const improved = !prev || nextVal > Number(prev.metricValue || 0);
  await fbPatch(env, `arena_world/admin_event/entries/${player.phone}`, {
    phone: player.phone,
    displayName: player.displayName || `لاعب ${String(player.phone || '').slice(-4)}`,
    characterId: player.activeCharacterId || 'buddy',
    activeFrame: player.activeFrame || '',
    metricValue: nextVal,
    updatedAt: improved ? now : Number((prev && prev.updatedAt) || now)
  });
}

async function settleAdminEventIfDue(env, force = false) {
  const evObj = await ensureAdminEvent(env);
  const now = Date.now();
  if (evObj.settled) return { settledNow: false, evObj };
  if (!force && (!evObj.enabled || now < Number(evObj.endAt || 0))) return { settledNow: false, evObj };

  await fbPatch(env, 'arena_world/admin_event', { settled: true, enabled: false, settledAt: now });
  evObj.settled = true;
  evObj.enabled = false;

  const playersMap = (await fbGet(env, 'arena_world/players')) || {};
  const entriesArr = Object.values(evObj.entries || {})
    .filter((e) => e && e.phone && !(playersMap[e.phone] && playersMap[e.phone].frozen))
    .sort((a, b) => (Number(b.metricValue || 0) - Number(a.metricValue || 0)) || (Number(a.updatedAt || 0) - Number(b.updatedAt || 0)));

  const rewardPts = Math.max(0, Math.floor(Number(evObj.fixedRewardPts || 1000)));
  const ex = buildEventBadgeAsset(evObj.eventNumber || 1);
  const winners = [];

  if (entriesArr.length > 0) {
    const top1 = entriesArr[0];
    const p1 = playersMap[top1.phone] || (await fbGet(env, `arena_world/players/${top1.phone}`));
    if (p1 && !p1.frozen) {
      if (rewardPts > 0) {
        await updatePlayerBalance(env, p1, rewardPts, {
          txId: `evt_win_${evObj.eventId}`,
          type: `admin_event_reward_${evObj.eventNumber || 1}`,
          delta: rewardPts,
          at: now
        });
      }
      const nextBadges = { ...((((p1.games && p1.games.tower_match) || {}).badges) || {}), [ex.badgeId]: { name: ex.badgeName, file: ex.badgeFile } };
      const nextCos = { ...(p1.cosmetics || {}), [ex.frameId]: true };
      await fbPatch(env, `arena_world/players/${p1.phone}`, { cosmetics: nextCos, activeFrame: ex.frameId });
      await fbPatch(env, `arena_world/players/${p1.phone}/games/tower_match`, { badges: nextBadges, activeBadge: ex.badgeId });
      await pushPlayerNotification(env, p1.phone, {
        kind: 'admin_event_winner',
        title: `🏆 فزت بحدث «${evObj.title}»!`,
        body: `حصلت على المكافأة الثابتة (${rewardPts.toLocaleString()} عملة) + ${ex.badgeName} + ${ex.frameName}!`
      });
    }
    entriesArr.slice(0, 7).forEach((row, idx) => {
      winners.push({
        rank: idx + 1,
        phone: row.phone,
        displayName: row.displayName,
        metricValue: Number(row.metricValue || 0),
        rewardPts: idx === 0 ? rewardPts : 0,
        badgeId: idx === 0 ? ex.badgeId : '',
        frameId: idx === 0 ? ex.frameId : ''
      });
    });
  }

  await fbPatch(env, 'arena_world/admin_event', { winners, settledAt: now });
  await fbPatch(env, `arena_world/admin_event_history/${evObj.eventId}`, {
    ...evObj, winners, settledAt: now
  });

  return { settledNow: true, winners, rewardPts };
}

async function handleAdminEventConfig(env, body) {
  const cur = await ensureAdminEvent(env);
  const now = Date.now();
  const occId = String(body.occasionId || cur.occasionId || '');
  const matchedOcc = ADMIN_EVENT_OCCASIONS_25.find((o) => o.id === occId) || null;
  const eventNumber = Math.max(1, Math.floor(Number(body.eventNumber !== undefined ? body.eventNumber : (cur.eventNumber || 1))));
  const durationDays = Math.max(1, Math.min(90, Math.floor(Number(body.durationDays !== undefined ? body.durationDays : (cur.durationDays || 7)))));
  const fixedRewardPts = Math.max(0, Math.floor(Number(body.fixedRewardPts !== undefined ? body.fixedRewardPts : (cur.fixedRewardPts || 1000))));
  const kind = ['highest_score', 'cumulative_score', 'pvp_wins', 'bosses_defeated'].includes(body.kind)
    ? body.kind
    : ((matchedOcc && matchedOcc.kind) || cur.kind || 'highest_score');
  const title = String((body.title !== undefined && String(body.title).trim()) ? body.title : ((matchedOcc && matchedOcc.name) || cur.title || 'حدث الإدارة')).trim().slice(0, 100);
  const rulesText = String((body.rulesText !== undefined && String(body.rulesText).trim()) ? body.rulesText : ((matchedOcc && matchedOcc.rules) || cur.rulesText || '')).trim().slice(0, 400);
  const bannerUrl = String((body.bannerUrl !== undefined && String(body.bannerUrl).trim()) ? body.bannerUrl : (cur.bannerUrl || './game_tower.png')).trim().slice(0, 300);
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : Boolean(cur.enabled);

  const ex = buildEventBadgeAsset(eventNumber);
  const startNewCycle = Boolean(body.startNewCycle);
  const updates = {
    eventNumber,
    occasionId: matchedOcc ? matchedOcc.id : occId,
    title,
    kind,
    rulesText,
    bannerUrl,
    fixedRewardPts,
    durationDays,
    enabled,
    exclusiveBadgeId: ex.badgeId,
    exclusiveBadgeName: ex.badgeName,
    exclusiveBadgeFile: ex.badgeFile,
    exclusiveFrameId: ex.frameId,
    exclusiveFrameName: ex.frameName,
    exclusiveFrameFile: ex.frameFile,
    exclusiveAnim: ex.anim
  };

  if (startNewCycle) {
    updates.eventId = `evt_${eventNumber}_${now}`;
    updates.startAt = now;
    updates.endAt = now + durationDays * 86400000;
    updates.settled = false;
    updates.winners = [];
    await fbDelete(env, 'arena_world/admin_event/entries');
  } else if (!cur.endAt || Number(cur.endAt) <= now) {
    updates.startAt = now;
    updates.endAt = now + durationDays * 86400000;
    updates.settled = false;
  }

  await fbPatch(env, 'arena_world/admin_event', updates);
  return jsonResponse({ ok: true, message: `✅ تم حفظ إعدادات حدث الإدارة #${eventNumber} («${title}») بنجاح!` });
}

async function handleAdminEventSettle(env) {
  const res = await settleAdminEventIfDue(env, true);
  if (!res.settledNow) {
    return jsonResponse({ code: 'ERR_ALREADY_SETTLED', message: 'تمت تسوية هذا الحدث مسبقاً أو لا يوجد متسابقون.' }, 400);
  }
  const topWinner = res.winners && res.winners[0];
  return jsonResponse({
    ok: true,
    winners: res.winners,
    message: topWinner
      ? `🏆 تم إغلاق الحدث وتتويج الفائز (${topWinner.displayName}) بمكافأة ${res.rewardPts.toLocaleString()} عملة والشارة والإطار الحصري!`
      : 'تم إغلاق الحدث وتسجيل النتيجة.'
  });
}

async function handleEventStatus(env, player) {
  if (player) {
    const cfg = (await fbGet(env, 'arena_world/config')) || {};
    const lm = getLockedModesConfig(cfg);
    if (lm.events) return jsonResponse({ code: 'ERR_MODE_LOCKED', message: 'أحداث التحدي مغلقة مؤقتاً من الإدارة.' }, 403);
  }
  await settleAdminEventIfDue(env, false);
  const evObj = await ensureAdminEvent(env);
  const playersMap = (await fbGet(env, 'arena_world/players')) || {};
  const entriesArr = Object.values(evObj.entries || {})
    .filter((e) => e && e.phone && !(playersMap[e.phone] && playersMap[e.phone].frozen))
    .sort((a, b) => (Number(b.metricValue || 0) - Number(a.metricValue || 0)) || (Number(a.updatedAt || 0) - Number(b.updatedAt || 0)));

  const leaderboard = entriesArr.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    displayName: r.displayName,
    metricValue: Number(r.metricValue || 0),
    characterId: r.characterId || 'buddy',
    activeFrame: r.activeFrame || '',
    isMe: Boolean(player && r.phone === player.phone)
  }));

  let myRank = null;
  let myValue = 0;
  if (player) {
    const idx = entriesArr.findIndex((r) => r.phone === player.phone);
    if (idx >= 0) {
      myRank = idx + 1;
      myValue = Number(entriesArr[idx].metricValue || 0);
    }
  }

  return jsonResponse({
    ok: true,
    event: {
      eventId: evObj.eventId,
      eventNumber: Number(evObj.eventNumber || 1),
      enabled: Boolean(evObj.enabled),
      settled: Boolean(evObj.settled),
      occasionId: evObj.occasionId || '',
      title: evObj.title || 'حدث الإدارة',
      kind: evObj.kind || 'highest_score',
      rulesText: evObj.rulesText || '',
      bannerUrl: evObj.bannerUrl || './game_tower.png',
      fixedRewardPts: Number(evObj.fixedRewardPts || 1000),
      durationDays: Number(evObj.durationDays || 7),
      startAt: Number(evObj.startAt || 0),
      endAt: Number(evObj.endAt || 0),
      exclusiveBadgeId: evObj.exclusiveBadgeId || '',
      exclusiveBadgeName: evObj.exclusiveBadgeName || '',
      exclusiveBadgeFile: evObj.exclusiveBadgeFile || './assets/event_badges/event_badge_01.png',
      exclusiveFrameId: evObj.exclusiveFrameId || '',
      exclusiveFrameName: evObj.exclusiveFrameName || '',
      exclusiveFrameFile: evObj.exclusiveFrameFile || '',
      exclusiveAnim: evObj.exclusiveAnim || 'fx-galaxy',
      winners: Array.isArray(evObj.winners) ? evObj.winners : [],
      leaderboard,
      myRank,
      myValue
    },
    occasionsCatalog: ADMIN_EVENT_OCCASIONS_25
  });
}


// ============================================================================
// نظام مصادقة الإدارة المستقل والمحمي (0% اعتماد على متجر معاذ)
// يعتمد على متغير سري في Cloudflare (ADMIN_PASS) مع حماية Rate-Limit + جلسات مؤقتة
// ============================================================================
async function verifyAdminSession(env, request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || token.length < 32) return { ok: false, reason: 'NO_ADMIN_TOKEN' };
  const ses = await fbGet(env, `arena_world/admin_sessions/${token}`);
  if (!ses || !ses.active || Date.now() > Number(ses.expiresAt || 0)) {
    return { ok: false, reason: 'ADMIN_SESSION_EXPIRED' };
  }
  return { ok: true, token };
}

async function handleAdminLogin(env, body, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipKey = ip.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
  const rlPath = `arena_world/admin_login_rl/${ipKey}`;
  const rl = (await fbGet(env, rlPath)) || { count: 0, resetAt: 0 };
  const now = Date.now();
  if (rl.count >= 5 && now < Number(rl.resetAt || 0)) {
    const mins = Math.max(1, Math.ceil((rl.resetAt - now) / 60000));
    return jsonResponse({ code: 'ERR_RATE_LIMIT', message: `تم إيقاف المحاولات مؤقتاً. حاول بعد ${mins} دقيقة.` }, 429);
  }

  const inputPass = String((body && body.pass) || '').trim();
  const expectedPass = String((env && env.ADMIN_PASS) || 'MTH_ADMIN_2026!').trim();
  if (!inputPass || inputPass !== expectedPass) {
    const nextCnt = now >= Number(rl.resetAt || 0) ? 1 : Number(rl.count || 0) + 1;
    await fbPatch(env, rlPath, { count: nextCnt, resetAt: now + 15 * 60 * 1000 });
    return jsonResponse({ code: 'ERR_BAD_ADMIN_PASS', message: 'بيانات الدخول غير صحيحة.' }, 403);
  }

  if (rl.count > 0) await fbPatch(env, rlPath, { count: 0, resetAt: 0 });
  const randBytes = new Uint8Array(24);
  crypto.getRandomValues(randBytes);
  const adminToken = Array.from(randBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = now + 12 * 60 * 60 * 1000;
  await fbPatch(env, `arena_world/admin_sessions/${adminToken}`, {
    active: true, createdAt: now, expiresAt, ip: ipKey
  });
  return jsonResponse({ ok: true, adminToken, expiresAt });
}

async function handleAdminLogout(env, request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token && token.length >= 32) {
    await fbDelete(env, `arena_world/admin_sessions/${token}`);
  }
  return jsonResponse({ ok: true });
}


// ============================================================================
// معالجات الإدارة المتقدمة: إدارة اللاعبين والسجل + متجر الأدوات والـ XP + التصفير الشامل
// ============================================================================
async function handleAdminPlayersList(env, body) {
  const q = String((body && body.q) || '').trim().toLowerCase();
  const playersMap = (await fbGet(env, 'arena_world/players')) || {};
  const list = Object.values(playersMap)
    .filter((p) => {
      if (!p || !p.phone) return false;
      if (!q) return true;
      return String(p.phone).toLowerCase().includes(q) || String(p.displayName || '').toLowerCase().includes(q);
    })
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .slice(0, 60)
    .map((p) => ({
      phone: p.phone,
      displayName: p.displayName || '',
      points: Number(p.points || 0),
      xp: Number(p.xp || 0),
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      winStreak: Number(p.winStreak || 0),
      frozen: Boolean(p.frozen),
      trusted: Boolean(p.trusted),
      antiCheatFlags: Number(p.antiCheatFlags || 0)
    }));
  return jsonResponse({ ok: true, players: list });
}

async function handleAdminPlayerUpdate(env, body) {
  const phone = String((body && body.phone) || '').replace(/[^0-9]/g, '');
  if (!phone) return jsonResponse({ code: 'ERR_PHONE', message: 'رقم اللاعب مطلوب.' }, 400);
  const player = await fbGet(env, `arena_world/players/${phone}`);
  if (!player) return jsonResponse({ code: 'ERR_NO_PLAYER', message: 'اللاعب غير موجود.' }, 404);

  const now = Date.now();
  const updates = {};
  if (body.displayName !== undefined) updates.displayName = String(body.displayName || '').trim().slice(0, 40) || player.displayName;
  if (body.xp !== undefined) updates.xp = Math.max(0, Math.floor(Number(body.xp) || 0));
  if (body.wins !== undefined) updates.wins = Math.max(0, Math.floor(Number(body.wins) || 0));
  if (body.losses !== undefined) updates.losses = Math.max(0, Math.floor(Number(body.losses) || 0));
  if (body.winStreak !== undefined) updates.winStreak = Math.max(0, Math.floor(Number(body.winStreak) || 0));
  if (typeof body.frozen === 'boolean') updates.frozen = body.frozen;
  if (typeof body.trusted === 'boolean') updates.trusted = body.trusted;

  if (body.points !== undefined) {
    const targetPts = Math.max(0, Math.floor(Number(body.points) || 0));
    const delta = targetPts - Number(player.points || 0);
    if (delta !== 0) {
      await updatePlayerBalance(env, player, delta, {
        txId: `adm_adj_${now}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'admin_manual_adjustment',
        delta,
        at: now
      });
    }
  }

  if (Object.keys(updates).length > 0) {
    await fbPatch(env, `arena_world/players/${phone}`, updates);
  }
  return jsonResponse({ ok: true, message: `✅ تم حفظ تعديلات اللاعب (${phone}) بنجاح.` });
}

async function handleAdminPlayerLedger(env, body) {
  const phone = String((body && body.phone) || '').replace(/[^0-9]/g, '');
  if (!phone) return jsonResponse({ code: 'ERR_PHONE', message: 'رقم اللاعب مطلوب.' }, 400);
  const [player, ledgerDays, notifs] = await Promise.all([
    fbGet(env, `arena_world/players/${phone}`),
    fbGet(env, `arena_world/ledger/${phone}`),
    fbGet(env, `arena_world/notifications/${phone}`)
  ]);
  if (!player) return jsonResponse({ code: 'ERR_NO_PLAYER', message: 'اللاعب غير موجود.' }, 404);

  const entries = [];
  if (ledgerDays && typeof ledgerDays === 'object') {
    for (const [dayKey, dayTx] of Object.entries(ledgerDays)) {
      if (!dayTx || typeof dayTx !== 'object') continue;
      for (const [txKey, tx] of Object.entries(dayTx)) {
        if (!tx) continue;
        entries.push({
          txId: tx.txId || txKey,
          dayKey,
          type: tx.type || 'tx',
          delta: Number(tx.delta || 0),
          at: Number(tx.at || 0)
        });
      }
    }
  }
  entries.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

  const notifList = notifs && typeof notifs === 'object'
    ? Object.values(notifs).sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 15)
    : [];

  return jsonResponse({
    ok: true,
    player: {
      phone: player.phone,
      displayName: player.displayName || '',
      points: Number(player.points || 0),
      verifiedCheckpointBalance: Number(player.verifiedCheckpointBalance || 0),
      xp: Number(player.xp || 0),
      wins: Number(player.wins || 0),
      losses: Number(player.losses || 0),
      winStreak: Number(player.winStreak || 0),
      recordsBroken: Number(player.recordsBroken || 0),
      totalRoundsPlayed: Number(player.totalRoundsPlayed || 0),
      antiCheatFlags: Number(player.antiCheatFlags || 0),
      frozen: Boolean(player.frozen),
      trusted: Boolean(player.trusted),
      referredBy: player.referredBy || '',
      referralStats: player.referralStats || { totalCount: 0, totalEarnedPts: 0 },
      inventory: player.inventory || {},
      cosmetics: player.cosmetics || {}
    },
    ledger: entries.slice(0, 40),
    notifications: notifList
  });
}

async function handleAdminShopConfig(env, body, config) {
  const itemId = String((body && body.itemId) || '').trim();
  if (!SHOP_PRICES[itemId]) {
    return jsonResponse({ code: 'ERR_SHOP_ITEM', message: 'معرّف الأداة في المتجر غير صحيح.' }, 400);
  }
  const price = Math.max(0, Math.floor(Number((body && body.price) || 0)));
  const reqXp = Math.max(0, Math.floor(Number((body && body.reqXp) || 0)));
  await fbPatch(env, `arena_world/config/shopOverrides/${itemId}`, { price, reqXp });
  return jsonResponse({ ok: true, message: `✅ تم تحديث سعر (${price}) وحد XP (${reqXp}) للأداة (${SHOP_PRICES[itemId].name}).` });
}

async function handleAdminResetAllGameData(env, body) {
  const confirmCode = String((body && body.confirmCode) || '').trim();
  if (confirmCode !== 'RESET_ALL_ARENA') {
    return jsonResponse({ code: 'ERR_CONFIRM', message: 'أدخل كلمة التأكيد RESET_ALL_ARENA للتنفيذ.' }, 400);
  }
  const now = Date.now();
  await Promise.all([
    fbDelete(env, 'arena_world/players'),
    fbDelete(env, 'arena_world/ledger'),
    fbDelete(env, 'arena_world/sessions'),
    fbDelete(env, 'arena_world/pvp_matches'),
    fbDelete(env, 'arena_world/weekly_tournaments'),
    fbDelete(env, 'arena_world/weekly_history'),
    fbDelete(env, 'arena_world/admin_event'),
    fbDelete(env, 'arena_world/admin_event_history'),
    fbDelete(env, 'arena_world/pending_cashouts'),
    fbDelete(env, 'arena_world/pending_topups'),
    fbDelete(env, 'arena_world/notifications'),
    fbDelete(env, 'arena_world/admin_alerts'),
    fbDelete(env, 'arena_world/devices'),
    fbDelete(env, 'arena_world/ref_codes'),
    fbDelete(env, 'arena_world/idem')
  ]);
  await fbPatch(env, 'arena_world/admin_stats', {
    totalRevenuePts: 0,
    referralPaidPts: 0,
    bySource: {},
    resetAt: now
  });
  await fbPatch(env, 'arena_world/admin_records', {
    tower_match: { title: 'برج التحدي اللانهائي', currentRecord: 250, holderName: 'إدارة العالم', holderPhone: '', entryCostPts: 10, jackpotPts: 120, nextSeedPts: 0 },
    hill_drive: { title: 'قيادة التلال 2D', currentRecord: 150, holderName: 'إدارة العالم', holderPhone: '', entryCostPts: 10, jackpotPts: 100, nextSeedPts: 0 },
    cyber_shooter: { title: 'ميجا شوتر 2D', currentRecord: 200, holderName: 'إدارة العالم', holderPhone: '', entryCostPts: 10, jackpotPts: 100, nextSeedPts: 0 }
  });
  for (const gId of WEEKLY_GAMES) {
    await ensureWeeklyTournament(env, gId);
  }
  await ensureAdminEvent(env);
  return jsonResponse({ ok: true, message: '⚠️ تم تصفير جميع بيانات اللعبة واللاعبين والبطولات والأحداث والسجلات بالكامل!' });
}
