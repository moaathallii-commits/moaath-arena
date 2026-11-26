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
  extra_hp: { price: 25, type: 'tactical', name: 'قلب إضافي (+1 HP)' },
  fuel_magnet: { price: 20, type: 'tactical', name: 'مغناطيس الوقود' },
  streak_shield: { price: 30, type: 'passive', name: 'حماية السلسلة' },
  bundle_starter: { price: 80, type: 'bundle', name: 'باقة المنطلق', grants: { shield_1: 2, fuel_boost: 2 } },
  arena_pass: { price: 40, type: 'pass', name: 'تذكرة الساحة (5 جولات)', grants: { arena_pass: 5 } },
  frame_gold: { price: 0, reqXp: 300, type: 'cosmetic', name: 'الإطار الملكي الذهبي' },
  frame_cyber: { price: 0, reqXp: 800, type: 'cosmetic', name: 'إطار سايبر الماسي' }
};


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
  crate_basic:     { id: 'crate_basic',     name: 'صندوق الاستفزاز العادي',   price: 25,  rarity: 'common',    emoji: '📦' },
  crate_epic:      { id: 'crate_epic',      name: 'صندوق الاستفزاز الملحمي', price: 75,  rarity: 'epic',      emoji: '🎁' },
  crate_legendary: { id: 'crate_legendary', name: 'صندوق الاستفزاز الأسطوري',price: 160, rarity: 'legendary', emoji: '👑' }
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

const DAILY_DEAL_POOL = ['shield_1', 'fuel_boost', 'double_xp', 'extra_hp', 'fuel_magnet', 'streak_shield'];

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

      // أ) نقاط نهاية الإدارة
      if (url.pathname.startsWith('/admin/')) {
        const storeAuth = await verifyStoreFirebaseToken(env, request);
        if (!storeAuth.ok || !storeAuth.isAdmin) {
          return jsonResponse({ code: 'ERR_ADMIN_ONLY', message: `صلاحية الإدارة مطلوبة. [${storeAuth.reason || 'NOT_ADMIN'}]` }, 403);
        }
        switch (url.pathname) {
          case '/admin/dashboard':
            return handleAdminDashboard(env, config);
          case '/admin/config':
            return handleAdminUpdateConfig(env, body);
          case '/admin/cashout/resolve':
            return handleAdminResolveCashout(env, body);
          case '/admin/player/unfreeze':
            return handleAdminUnfreeze(env, body);
          case '/admin/weekly/config':
            return handleAdminWeeklyConfig(env, body);
          case '/admin/weekly/settle':
            return handleAdminWeeklySettle(env, body);
          case '/admin/frames/config':
            return handleAdminFramesConfig(env, body);
          case '/admin/frames/bulk':
            return handleAdminFramesBulk(env, body, config);
          case '/admin/broadcast':
            return handleAdminBroadcast(env, body);
          case '/admin/player/trust':
            return handleAdminPlayerTrust(env, body);
          default:
            return jsonResponse({ code: 'ERR_404', message: 'مسار إدارة غير موجود' }, 404);
        }
      }

      if (config.killSwitch === true) {
        return jsonResponse({ maintenance: true, message: 'قيد التطوير' }, 503);
      }

      // ب-0) نقطة معاينة عامة لشاشة الدخول الأول (الجوائز الأسبوعية الحية)
      if (url.pathname === '/public/preview') {
        return handlePublicPreview(env, config);
      }

      // ب) نقاط نهاية جسر متجر معاذ
      if (url.pathname === '/bridge/store-info') {
        const storeAuth = await verifyStoreFirebaseToken(env, request);
        if (!storeAuth.ok) return jsonResponse({ code: 'ERR_STORE_AUTH', message: `الرجاء تسجيل الدخول في متجر معاذ أولاً. [${storeAuth.reason}]` }, 401);
        return handleBridgeStoreInfo(env, storeAuth, config);
      }

      if (url.pathname === '/bridge/generate-bind-key') {
        const storeAuth = await verifyStoreFirebaseToken(env, request);
        if (!storeAuth.ok) return jsonResponse({ code: 'ERR_STORE_AUTH', message: `الرجاء تسجيل الدخول في متجر معاذ أولاً. [${storeAuth.reason}]` }, 401);
        return handleGenerateBindKey(env, storeAuth);
      }

      if (url.pathname === '/bridge/store-to-arena') {
        const storeAuth = await verifyStoreFirebaseToken(env, request);
        if (!storeAuth.ok) return jsonResponse({ code: 'ERR_STORE_AUTH', message: `الرجاء تسجيل الدخول في متجر معاذ أولاً. [${storeAuth.reason}]` }, 401);
        return handleStoreToArenaTransfer(env, storeAuth, body, config);
      }

      // ج) نقاط نهاية تطبيق عالم التحديات (Arena PWA)
      if (url.pathname === '/auth/bind') {
        return handleBindDevice(env, body, config);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      const player = await verifyDeviceToken(env, token);
      if (!player) return jsonResponse({ code: 'ERR_AUTH_01', message: 'جلسة غير صالحة، أعد ربط الجهاز.' }, 401);
      if (player.frozen) return jsonResponse({ code: 'ERR_FROZEN', message: 'الحساب مجمد للمراجعة الأمنية.' }, 403);

      switch (url.pathname) {
        case '/player/profile':
          return handleProfile(env, player, config);
        case '/character/select':
          return handleSelectCharacter(env, player, body);
        case '/shop/buy':
          return handleShopBuy(env, player, body, config);
        case '/cosmetic/equip':
          return handleEquipCosmetic(env, player, body);
        case '/session/start':
          return handleSessionStart(env, player, body, config);
        case '/session/submit':
          return handleSessionSubmit(env, player, body, config);
        case '/weekly/status':
          return handleWeeklyStatus(env, player);
        case '/pvp/list':
          return handlePvpList(env);
        case '/pvp/create':
          return handlePvpCreate(env, player, body, config);
        case '/pvp/join':
          return handlePvpJoin(env, player, body, config);
        case '/bridge/cashout':
          return handleCashoutRequest(env, player, body, config);
        case '/tower/streak/claim':
          return handleTowerStreakClaim(env, player);
        case '/tower/cosmetic/equip':
          return handleTowerCosmeticEquip(env, player, body);
        case '/tower/taunt/open-crate':
          return handleOpenTauntCrate(env, player, body);
        case '/tower/taunt/equip':
          return handleEquipTaunt(env, player, body);
        case '/tower/taunt/send':
          return handleSendTaunt(env, player, body);
        case '/player/notifications/read':
          return handleReadNotifications(env, player);
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
  const sypRate = Number(config.usdToSypRate || config.sypPerUsd || 15000);
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

  const coinBuyRateSYP = Number(config.buyRateSYP || 0);
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
  await fbPatch(env, `arena_world/bridge_transfers/${idempotencyKey}`, { status: 'completed', completedAt: Date.now() });

  return jsonResponse({
    ok: true, addedCoins: coinsToAdd, sypAmount: syp, newArenaBalance: player.points,
    newStoreSyp: Math.floor(newStoreUsd * sypRate),
    message: `تم تحويل ${syp.toLocaleString('ar-SY')} ل.س إلى ${coinsToAdd} عملة معاذ بنجاح!`
  });
}

async function handleAdminDashboard(env, config) {
  await processDueAutoCashouts(env, config);
  const [cashouts, alerts, players, adminStats] = await Promise.all([
    fbGet(env, 'arena_world/pending_cashouts'),
    fbGet(env, 'arena_world/admin_alerts'),
    fbGet(env, 'arena_world/players'),
    fbGet(env, 'arena_world/admin_stats')
  ]);

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
      coinToUsdRate: Number(config.coinToUsdRate || 0.01),
      buyRateSYP: Number(config.buyRateSYP || 150),
      usdToSypRate: Number(config.usdToSypRate || 15000),
      recordEntryCostPts: Number(config.recordEntryCostPts || 10),
      autoRolloverWeekly: config.autoRolloverWeekly !== false,
      autoCashoutEnabled: Boolean(config.autoCashoutEnabled),
      autoCashoutMaxPts: Number(config.autoCashoutMaxPts || 200),
      autoCashoutMinWins: Number(config.autoCashoutMinWins || 3),
      broadcast: getActiveBroadcast(config)
    },
    adminProfit: (() => {
      const totalPts = Number((adminStats && adminStats.totalRevenuePts) || 0);
      const usdRate = Number(config.coinToUsdRate || 0.01);
      const sypRate = Number(config.usdToSypRate || 15000);
      const totalUsd = Number((totalPts * usdRate).toFixed(2));
      const totalSyp = Math.round(totalUsd * sypRate);
      return { totalPts, totalUsd, totalSyp, bySource: (adminStats && adminStats.bySource) || {} };
    })(),
    pendingCashouts, recentAlerts, frozenPlayers,
    weeklyTournaments: await getAllWeeklySummaries(env),
    framesCatalog: getEffectiveFramesCatalog(config)
  });
}

async function handleAdminUpdateConfig(env, body) {
  const updates = {};
  if (typeof body.killSwitch === 'boolean') updates.killSwitch = body.killSwitch;
  if (body.welcomePoints !== undefined) updates.welcomePoints = Math.max(0, Number(body.welcomePoints));
  if (body.minCashoutPts !== undefined) updates.minCashoutPts = Math.max(100, Number(body.minCashoutPts));
  if (body.pvpHouseEdgePct !== undefined) updates.pvpHouseEdgePct = Math.min(30, Math.max(0, Number(body.pvpHouseEdgePct)));
  if (body.coinToUsdRate !== undefined) updates.coinToUsdRate = Math.max(0.0001, Number(body.coinToUsdRate));
  if (body.buyRateSYP !== undefined) updates.buyRateSYP = Math.max(1, Number(body.buyRateSYP));
  if (body.usdToSypRate !== undefined) updates.usdToSypRate = Math.max(100, Number(body.usdToSypRate));
  if (body.recordEntryCostPts !== undefined) updates.recordEntryCostPts = Math.max(1, Math.floor(Number(body.recordEntryCostPts)));
  if (typeof body.autoRolloverWeekly === 'boolean') updates.autoRolloverWeekly = body.autoRolloverWeekly;
  if (typeof body.autoCashoutEnabled === 'boolean') updates.autoCashoutEnabled = body.autoCashoutEnabled;
  if (body.autoCashoutMaxPts !== undefined) updates.autoCashoutMaxPts = Math.max(100, Math.min(1000, Math.floor(Number(body.autoCashoutMaxPts))));
  if (body.autoCashoutMinWins !== undefined) updates.autoCashoutMinWins = Math.max(0, Math.floor(Number(body.autoCashoutMinWins)));
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
    const storeUser = await fbGet(env, `users/${cashout.phone}`);
    const currentUsd = Number((storeUser && storeUser.prepaidBalanceUSD) || 0);
    const newUsd = Number((currentUsd + Number(cashout.usdAmount)).toFixed(4));

    await fbPatch(env, `users/${cashout.phone}`, { prepaidBalanceUSD: newUsd });
    await fbPatch(env, `arena_world/pending_cashouts/${txId}`, { status: 'approved', resolvedAt: Date.now() });
    await fbPatch(env, `arena_world/bridge_transfers/${txId}`, {
      phone: cashout.phone, direction: 'arena_to_store', pts: cashout.pts, usdAmount: cashout.usdAmount, status: 'completed', createdAt: Date.now()
    });
    return jsonResponse({ ok: true, message: `تم اعتماد التحويل وإضافة ${cashout.usdAmount}$ لرصيد الزبون في المتجر.` });
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

async function handleBindDevice(env, { bindKey, deviceId }, config) {
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
    await fbPatch(env, playerPath, {
      phone: keyData.phone, displayName: keyData.displayName || 'لاعب جديد', activeCharacterId: 'buddy', activeFrame: '',
      points: welcomePts, verifiedCheckpointBalance: welcomePts, xp: 0, wins: 0, losses: 0,
      winStreak: 0, recordsBroken: 0, inventory: {}, cosmetics: {}, shopHistory: [], frozen: false, antiCheatFlags: 0, deviceToken
    });
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
  return jsonResponse({
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
      buyRateSYP: Number(config.buyRateSYP || 150),
      usdToSypRate: Number(config.usdToSypRate || 15000),
      coinToUsdRate: Number(config.coinToUsdRate || 0.01),
      recordEntryCostPts: Number(config.recordEntryCostPts || 10),
      autoRolloverWeekly: config.autoRolloverWeekly !== false,
      autoCashoutEnabled: Boolean(config.autoCashoutEnabled),
      autoCashoutMaxPts: Number(config.autoCashoutMaxPts || 200),
      autoCashoutMinWins: Number(config.autoCashoutMinWins || 3),
      broadcast: getActiveBroadcast(config)
    },
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

async function handleShopBuy(env, player, { itemId }, config = {}) {
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

  const item = SHOP_PRICES[itemId];
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

async function handleSessionStart(env, player, { gameId, mode, stakePts, pvpMatchId, useItem, usePass }, config) {
  if (!['hill_drive', 'cyber_shooter', 'tower_match'].includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير مدعومة.' }, 400);
  const playMode = mode || 'record';
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
    const rec = await fbGet(env, `arena_world/admin_records/${gameId}`);
    cost = Math.max(1, Number(config.recordEntryCostPts || (rec && rec.entryCostPts) || 10));
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
    const nextPool = Number(wtCur.poolPts || 0) + cost;
    const nextEntriesCount = Number(wtCur.totalRounds || 0) + 1;
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      poolPts: nextPool,
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
  return jsonResponse({ ok: true, sessionId, seed, activeItem, characterId: lockedCharId, startedAt: now });
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
    await fbPatch(env, `arena_world/pvp_matches/${matchId}`, {
      matchId, gameId: session.gameId, creatorPhone: player.phone, creatorName: player.displayName,
      creatorScore: score, stakePts: session.stakePts, seed: session.seed, status: 'open', createdAt: now
    });
    outcomeMsg = `تم نشر تحديك في الساحة بنتيجة (${score}) ورهان (${session.stakePts} عملة)!`;
  }

  if (session.mode === 'pvp_join' && session.pvpMatchId) {
    const match = await fbGet(env, `arena_world/pvp_matches/${session.pvpMatchId}`);
    if (match && match.status === 'open') {
      const pot = Number(match.stakePts) * 2;
      let houseEdgePct = Number(config.pvpHouseEdgePct || 10);
      if (charId === 'princess_layla') houseEdgePct = Math.max(5, houseEdgePct - 2);
      const fee = Math.floor(pot * (houseEdgePct / 100));
      const prize = pot - fee;
      const rec = await fbGet(env, `arena_world/admin_records/${match.gameId}`);
      if (rec) await fbPatch(env, `arena_world/admin_records/${match.gameId}`, { jackpotPts: Number(rec.jackpotPts || 100) + Math.floor(fee / 2) });
      await recordAdminRevenue(env, 'pvp', Math.ceil(fee / 2));

      let winnerPhone = null;
      if (score > match.creatorScore) {
        won = true; winnerPhone = player.phone; rewardPts = prize;
        await updatePlayerBalance(env, player, prize, { txId: `pvp_win_${match.matchId}`, type: 'pvp_win', delta: prize, at: now });
        await fbPatch(env, `arena_world/players/${player.phone}`, { wins: (player.wins || 0) + 1, winStreak: (player.winStreak || 0) + 1 });
        outcomeMsg = `🏆 فزت بالتحدي! (${score} مقابل ${match.creatorScore}) وربحت ${prize} عملة معاذ!`;
      } else if (score < match.creatorScore) {
        winnerPhone = match.creatorPhone;
        const creator = await fbGet(env, `arena_world/players/${match.creatorPhone}`);
        if (creator) {
          await updatePlayerBalance(env, creator, prize, { txId: `pvp_win_${match.matchId}`, type: 'pvp_win', delta: prize, at: now });
          await fbPatch(env, `arena_world/players/${creator.phone}`, { wins: (creator.wins || 0) + 1 });
        }
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
              stakePts: Number(match.stakePts || 10),
              scoreDiff: Math.max(1, Number(match.creatorScore) - score),
              at: now
            }
          });
        }
        outcomeMsg = `خسرت التحدي (${score} مقابل ${match.creatorScore}).` + (streakProtected ? ' (🔥 بطاقة حماية السلسلة حفظت سلسلتك!)' : '');
      } else {
        const refund = Math.floor(prize / 2);
        await updatePlayerBalance(env, player, refund, { txId: `pvp_draw_${match.matchId}`, type: 'pvp_draw', delta: refund, at: now });
        const creator = await fbGet(env, `arena_world/players/${match.creatorPhone}`);
        if (creator) await updatePlayerBalance(env, creator, refund, { txId: `pvp_draw_${match.matchId}`, type: 'pvp_draw', delta: refund, at: now });
        outcomeMsg = `تعادل (${score} مقابل ${match.creatorScore})! أُعيد ${refund} عملة لكل لاعب.`;
      }
      await fbPatch(env, `arena_world/pvp_matches/${match.matchId}`, {
        opponentPhone: player.phone, opponentName: player.displayName, opponentScore: score, winnerPhone, status: 'completed', completedAt: now
      });
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (!won && session.mode !== 'pvp_create' && charId === 'butler_farid' && player.lastCashbackDay !== todayKey) {
    const cashback = Math.max(1, Math.floor(Number(session.stakePts || 0) * 0.1));
    await updatePlayerBalance(env, player, cashback, { txId: `cb_${sessionId}`, type: 'vip_cashback', delta: cashback, at: now });
    await fbPatch(env, `arena_world/players/${player.phone}`, { lastCashbackDay: todayKey });
    outcomeMsg += ` (السيد فريد أعاد لك ${cashback} عملة Cashback!)`;
  }

  await fbPatch(env, `arena_world/players/${player.phone}`, { xp: (player.xp || 0) + xpGain });
  let streakUpdate = null;
  if (session.gameId === 'tower_match') {
    streakUpdate = await runAutomaticTowerStreakForPlayer(env, player);
  }
  return jsonResponse({ ok: true, won, score, rewardPts, xpGain, streakUpdate, message: outcomeMsg });
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

async function handlePvpList(env) {
  const matches = (await fbGet(env, 'arena_world/pvp_matches')) || {};
  const openList = Object.values(matches).filter((m) => m.status === 'open').sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  return jsonResponse({ ok: true, matches: openList });
}

async function handlePvpCreate(env, player, body, config) {
  return handleSessionStart(env, player, { gameId: body.gameId, mode: 'pvp_create', stakePts: Number(body.stakePts || 20), useItem: body.useItem }, config);
}

async function handlePvpJoin(env, player, { matchId, useItem }, config) {
  const match = await fbGet(env, `arena_world/pvp_matches/${matchId}`);
  if (!match || match.status !== 'open') return jsonResponse({ code: 'ERR_PVP_CLOSED', message: 'هذا التحدي لم يعد متاحاً.' }, 400);
  if (match.creatorPhone === player.phone) return jsonResponse({ code: 'ERR_PVP_SELF', message: 'لا يمكنك قبول تحديك الخاص.' }, 400);
  return handleSessionStart(env, player, { gameId: match.gameId, mode: 'pvp_join', stakePts: match.stakePts, pvpMatchId: matchId, useItem }, config);
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

async function handleCashoutRequest(env, player, { tierPts }, config) {
  const pts = Number(tierPts);
  const minCashout = Number(config.minCashoutPts || 100);
  if (!ALLOWED_CASHOUT_TIERS.includes(pts) || pts < minCashout) return jsonResponse({ code: 'ERR_TIER', message: `فئة غير مسموحة. الفئات: ${ALLOWED_CASHOUT_TIERS.join(', ')}` }, 400);
  if (player.points < pts) return jsonResponse({ code: 'ERR_FUNDS', message: 'الرصيد غير كافٍ.' }, 400);

  const auditOk = await verifyRollingLedger(env, player);
  if (!auditOk) {
    await flagAndFreeze(env, player, 'LEDGER_MISMATCH_ON_CASHOUT', { actual: player.points });
    return jsonResponse({ code: 'ERR_AUDIT_FAIL', message: 'تم تجميد الحساب تلقائياً لعدم تطابق السجل.' }, 403);
  }

  const txId = `cash_${crypto.randomUUID()}`;
  const now = Date.now();
  const usdAmount = Number((pts * Number(config.coinToUsdRate || 0.01)).toFixed(4));
  await updatePlayerBalance(env, player, -pts, { txId, type: 'cashout_pending', delta: -pts, at: now });
  const isTrusted = Boolean(player.trusted) || (Number(player.wins || 0) >= Number(config.autoCashoutMinWins || 3) && Number(player.antiCheatFlags || 0) === 0 && !player.frozen);
  const autoEligible = Boolean(config.autoCashoutEnabled) && isTrusted && pts <= Number(config.autoCashoutMaxPts || 200);
  await fbPatch(env, `arena_world/pending_cashouts/${txId}`, {
    phone: player.phone, pts, usdAmount, status: 'pending_audit', autoEligible, createdAt: now, releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });
  return jsonResponse({ ok: true, txId, usdAmount, autoEligible, releaseAt: now + CASHOUT_AUDIT_DELAY_MS });
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
    const nextEnd = now + 7 * 24 * 60 * 60 * 1000;
    await fbDelete(env, `arena_world/weekly_tournaments/${gameId}/entries`);
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      gameId, title: WEEKLY_GAME_TITLES[gameId] || gameId, cycleId: nextCycleId,
      entryFeePts: Number(wt.entryFeePts || 10), startAt: now, endAt: nextEnd,
      poolPts: 0, totalRounds: 0, settled: false
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
      return {
        rank: idx + 1,
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
  const tournaments = await getAllWeeklySummaries(env, player.phone);
  return jsonResponse({ ok: true, tournaments });
}

async function handleAdminWeeklyConfig(env, { gameId, entryFeePts, startAt, endAt, resetCycle }) {
  if (!WEEKLY_GAMES.includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير صالحة.' }, 400);
  const fee = Math.max(1, Number(entryFeePts || 10));
  const sAt = Number(startAt || Date.now());
  const eAt = Number(endAt || (sAt + 7 * 24 * 60 * 60 * 1000));
  if (eAt <= sAt) return jsonResponse({ code: 'ERR_DATES', message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.' }, 400);

  if (resetCycle) {
    const newCycleId = `wk_${gameId}_${Date.now()}`;
    await fbDelete(env, `arena_world/weekly_tournaments/${gameId}/entries`);
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      gameId, title: WEEKLY_GAME_TITLES[gameId], cycleId: newCycleId,
      entryFeePts: fee, startAt: sAt, endAt: eAt, poolPts: 0, totalRounds: 0, settled: false
    });
    return jsonResponse({ ok: true, message: `تم بدء دورة بطولة أسبوعية جديدة للعبة ${WEEKLY_GAME_TITLES[gameId]}!` });
  } else {
    await fbPatch(env, `arena_world/weekly_tournaments/${gameId}`, {
      entryFeePts: fee, startAt: sAt, endAt: eAt
    });
    return jsonResponse({ ok: true, message: `تم تحديث إعدادات بطولة ${WEEKLY_GAME_TITLES[gameId]} بنجاح.` });
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
  const usdToSypRate = Number(config.usdToSypRate || 15000);
  const buyRateSYP = Number(config.buyRateSYP || 150);
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
