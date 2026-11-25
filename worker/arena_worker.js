/**
 * Moaath Arena World - Cloudflare Worker (Upgraded Shop + SYP Bridge + Safe CORS)
 * المسار في GitHub (مستودع moaath-arena): worker/arena_worker.js
 * السياسة الأمنية: 0% ذكاء اصطناعي في المال أو النقاط أو التحويلات أو شام كاش.
 */

const ALLOWED_CASHOUT_TIERS = [100, 200, 500, 1000];
const CASHOUT_AUDIT_DELAY_MS = 60 * 60 * 1000;
const ROLLING_LEDGER_DAYS = 7;
const ADMIN_EMAIL = '0965461504@moaath.store';

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
          default:
            return jsonResponse({ code: 'ERR_404', message: 'مسار إدارة غير موجود' }, 404);
        }
      }

      if (config.killSwitch === true) {
        return jsonResponse({ maintenance: true, message: 'قيد التطوير' }, 503);
      }

      // ب) نقاط نهاية جسر متجر معاذ
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
          return handleProfile(env, player);
        case '/character/select':
          return handleSelectCharacter(env, player, body);
        case '/shop/buy':
          return handleShopBuy(env, player, body);
        case '/cosmetic/equip':
          return handleEquipCosmetic(env, player, body);
        case '/session/start':
          return handleSessionStart(env, player, body, config);
        case '/session/submit':
          return handleSessionSubmit(env, player, body, config);
        case '/pvp/list':
          return handlePvpList(env);
        case '/pvp/create':
          return handlePvpCreate(env, player, body, config);
        case '/pvp/join':
          return handlePvpJoin(env, player, body, config);
        case '/bridge/cashout':
          return handleCashoutRequest(env, player, body, config);
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
  const [cashouts, alerts, players] = await Promise.all([
    fbGet(env, 'arena_world/pending_cashouts'),
    fbGet(env, 'arena_world/admin_alerts'),
    fbGet(env, 'arena_world/players')
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
      usdToSypRate: Number(config.usdToSypRate || 15000)
    },
    pendingCashouts, recentAlerts, frozenPlayers
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

async function handleProfile(env, player) {
  const unlockedVips = await getPlayerUnlockedVips(env, player.phone);
  let activeChar = player.activeCharacterId || 'buddy';
  if (VIP_CHARS.includes(activeChar) && !unlockedVips.includes(activeChar)) {
    activeChar = 'buddy';
    await fbPatch(env, `arena_world/players/${player.phone}`, { activeCharacterId: 'buddy' });
  }
  const records = (await fbGet(env, 'arena_world/admin_records')) || {
    hill_drive: { title: 'قيادة التلال 2D', currentRecord: 350, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 },
    cyber_shooter: { title: 'ميجا شوتر 2D', currentRecord: 500, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 }
  };
  return jsonResponse({
    displayName: player.displayName,
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
  if (frameId && !cos[frameId]) {
    return jsonResponse({ code: 'ERR_FRAME_LOCKED', message: 'لم تفتح هذا الإطار بعد.' }, 403);
  }
  await fbPatch(env, `arena_world/players/${player.phone}`, { activeFrame: frameId || '' });
  return jsonResponse({ ok: true, activeFrame: frameId || '', message: frameId ? 'تم تفعيل الإطار على صورتك!' : 'تم إزالة الإطار.' });
}

async function handleShopBuy(env, player, { itemId }) {
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
  if (!['hill_drive', 'cyber_shooter'].includes(gameId)) return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير مدعومة.' }, 400);
  const playMode = mode || 'record';
  let cost = Number(stakePts) || 10;
  let usedPass = false;

  const inv = player.inventory || {};

  if (playMode === 'record') {
    const rec = await fbGet(env, `arena_world/admin_records/${gameId}`);
    cost = rec ? Number(rec.entryCostPts || 10) : 10;
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

  if (playMode === 'record') {
    const rec = (await fbGet(env, `arena_world/admin_records/${gameId}`)) || {
      title: gameId === 'hill_drive' ? 'قيادة التلال 2D' : 'ميجا شوتر 2D',
      currentRecord: gameId === 'hill_drive' ? 350 : 500, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100
    };
    const jackpotAdd = cost > 0 ? Math.floor(cost * 0.6) : 5;
    await fbPatch(env, `arena_world/admin_records/${gameId}`, { ...rec, jackpotPts: Number(rec.jackpotPts || 100) + jackpotAdd });
  }

  await fbPatch(env, `arena_world/sessions/${sessionId}`, {
    phone: player.phone, gameId, mode: playMode, stakePts: cost, pvpMatchId: pvpMatchId || null,
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

  if (session.mode === 'record') {
    const rec = await fbGet(env, `arena_world/admin_records/${session.gameId}`);
    if (rec && score > Number(rec.currentRecord || 0)) {
      won = true;
      let baseJackpot = Number(rec.jackpotPts || 100);
      if (charId === 'coach_sakhr') baseJackpot += Math.min(20, Math.floor(baseJackpot * 0.1));
      rewardPts = baseJackpot;
      await updatePlayerBalance(env, player, rewardPts, { txId: `win_rec_${sessionId}`, type: 'record_broken', delta: rewardPts, at: now });
      await fbPatch(env, `arena_world/admin_records/${session.gameId}`, { currentRecord: score, holderName: player.displayName, holderPhone: player.phone, jackpotPts: 50 });
      await fbPatch(env, `arena_world/players/${player.phone}`, { recordsBroken: (player.recordsBroken || 0) + 1 });
      outcomeMsg = `🔥 مبروك! كسرت الرقم القياسي وربحت الجائزة الكبرى (${rewardPts} عملة معاذ)!`;
    } else {
      outcomeMsg = `انتهت الجولة بنتيجة ${score}. الرقم القياسي الحالي: ${rec ? rec.currentRecord : 0}`;
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
  return jsonResponse({ ok: true, won, score, rewardPts, xpGain, message: outcomeMsg });
}

function validateTelemetry(session, score, telemetry) {
  const serverElapsedSec = (Date.now() - session.startedAt) / 1000;
  const clientElapsedSec = Number(telemetry.durationSec || 0);
  if (serverElapsedSec < 2 || Math.abs(serverElapsedSec - clientElapsedSec) > 15) return { valid: false, reason: 'TIME_TAMPERING_DETECTED' };
  if (score < 0 || !Array.isArray(telemetry.snapshots) || telemetry.snapshots.length === 0) return { valid: false, reason: 'MISSING_TELEMETRY_SNAPSHOTS' };
  if (session.gameId === 'hill_drive' && score > Math.ceil(serverElapsedSec * 45) + 50) return { valid: false, reason: 'HILL_DRIVE_SPEEDHACK' };
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
  await fbPatch(env, `arena_world/pending_cashouts/${txId}`, {
    phone: player.phone, pts, usdAmount, status: 'pending_audit', createdAt: now, releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });
  return jsonResponse({ ok: true, txId, usdAmount, releaseAt: now + CASHOUT_AUDIT_DELAY_MS });
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
