/**
 * Moaath Arena World - Cloudflare Worker (v1.0)
 * العزل المالي التام: 0% ذكاء اصطناعي في أي عملية مالية أو نقطية.
 */

const ALLOWED_CASHOUT_TIERS = [100, 200, 500, 1000]; // فئات السحب الثابتة
const CASHOUT_AUDIT_DELAY_MS = 60 * 60 * 1000;      // تأخير ساعة للمراجعة الخلفية

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsResponse(null, 204);
    if (request.method !== 'POST') return jsonResponse({ code: 'ERR_METHOD', message: 'POST only' }, 405);

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    // 1. فحص زر الطوارئ (Kill Switch)
    const config = await fbGet(env, 'arena_world/config');
    if (config && config.killSwitch === true) {
      return jsonResponse({ maintenance: true, message: 'قيد التطوير' }, 503);
    }

    // 2. ربط الجهاز لأول مرة بمفتاح المتجر
    if (url.pathname === '/auth/bind') {
      return handleBindDevice(env, body);
    }

    // 3. التحقق من توقيع جلسة اللاعب لجميع الطلبات التالية
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const player = await verifyDeviceToken(env, token);
    if (!player) return jsonResponse({ code: 'ERR_AUTH_01', message: 'جلسة غير صالحة، أعد ربط الجهاز.' }, 401);
    if (player.frozen) return jsonResponse({ code: 'ERR_FROZEN', message: 'الحساب مجمد للمراجعة الأمنية.' }, 403);

    // 4. توجيه نقاط النهاية
    switch (url.pathname) {
      case '/player/profile':
        return jsonResponse({ displayName: player.displayName, points: player.points, xp: player.xp });
      case '/session/start':
        return handleSessionStart(env, player, body);
      case '/bridge/cashout':
        return handleCashoutRequest(env, player, body, config);
      default:
        return jsonResponse({ code: 'ERR_404', message: 'مسار غير موجود' }, 404);
    }
  }
};

// ربط الجهاز ومنع تعدد الحسابات على نفس الجهاز
async function handleBindDevice(env, { bindKey, deviceId }) {
  if (!bindKey || !deviceId) return jsonResponse({ code: 'ERR_BIND_01', message: 'بيانات ناقصة' }, 400);

  const keyData = await fbGet(env, `arena_world/bind_keys/${bindKey}`);
  if (!keyData || keyData.used) {
    return jsonResponse({ code: 'ERR_BIND_02', message: 'المعرف غير صحيح أو مستخدم مسبقاً.' }, 403);
  }

  // التحقق من عدم ارتباط الجهاز بحساب آخر
  const existingDevice = await fbGet(env, `arena_world/devices/${deviceId}`);
  if (existingDevice && existingDevice.phone !== keyData.phone) {
    return jsonResponse({ code: 'ERR_MULTI_ACC', message: 'هذا الجهاز مرتبط بحساب آخر بالفعل.' }, 403);
  }

  const deviceToken = crypto.randomUUID() + '.' + Date.now();
  await fbPatch(env, `arena_world/bind_keys/${bindKey}`, { used: true, usedAt: Date.now() });
  await fbPatch(env, `arena_world/devices/${deviceId}`, { phone: keyData.phone, token: deviceToken });

  // إنشاء ملف اللاعب إن لم يكن موجوداً
  const playerPath = `arena_world/players/${keyData.phone}`;
  const existingPlayer = await fbGet(env, playerPath);
  if (!existingPlayer) {
    const welcomePts = (await fbGet(env, 'arena_world/config/welcomePoints')) || 0;
    await fbPatch(env, playerPath, {
      phone: keyData.phone,
      displayName: keyData.displayName || 'لاعب جديد',
      points: welcomePts,
      verifiedCheckpointBalance: welcomePts,
      xp: 0,
      frozen: false,
      antiCheatFlags: 0,
      deviceToken
    });
  } else {
    await fbPatch(env, playerPath, { deviceToken });
  }

  return jsonResponse({ ok: true, deviceToken });
}

// بدء جلسة موقعة وخصم رسم الدخول مسبقاً
async function handleSessionStart(env, player, { gameId, stakePts }) {
  const stake = Number(stakePts) || 0;
  if (stake < 0 || player.points < stake) {
    return jsonResponse({ code: 'ERR_FUNDS', message: 'رصيد عملات معاذ غير كافٍ.' }, 400);
  }

  const sessionId = `ses_${crypto.randomUUID()}`;
  const now = Date.now();
  const newBalance = player.points - stake;

  // خصم النقاط وتسجيل الحركة في السجل المتدحرج لليوم
  await fbPatch(env, `arena_world/players/${player.phone}`, { points: newBalance });
  await appendDailyLedger(env, player.phone, { txId: sessionId, type: 'match_entry', delta: -stake, at: now });
  await fbPatch(env, `arena_world/sessions/${sessionId}`, {
    phone: player.phone,
    gameId,
    stakePts: stake,
    startedAt: now,
    expiresAt: now + 5 * 60 * 1000,
    consumed: false
  });

  return jsonResponse({ ok: true, sessionId, startedAt: now });
}

// طلب سحب نقاط العالم إلى المتجر (فئات ثابتة + تدقيق السجل المتدحرج)
async function handleCashoutRequest(env, player, { tierPts }, config) {
  const pts = Number(tierPts);
  const minCashout = (config && config.minCashoutPts) || 100;

  if (!ALLOWED_CASHOUT_TIERS.includes(pts) || pts < minCashout) {
    return jsonResponse({ code: 'ERR_TIER', message: `فئة السحب غير مسموحة. الحد الأدنى ${minCashout}` }, 400);
  }
  if (player.points < pts) {
    return jsonResponse({ code: 'ERR_FUNDS', message: 'الرصيد غير كافٍ.' }, 400);
  }

  // التحقق الرياضي من السجل المتدحرج (آخر 7 أيام + نقطة التثبيت)
  const ledgerValid = await auditRollingLedger(env, player);
  if (!ledgerValid) {
    // تجميد فوري وإشعار الإدارة
    await fbPatch(env, `arena_world/players/${player.phone}`, {
      frozen: true,
      antiCheatFlags: (player.antiCheatFlags || 0) + 1
    });
    await fbPatch(env, `arena_world/admin_alerts/${Date.now()}`, {
      phone: player.phone,
      reason: 'LEDGER_MISMATCH_ON_CASHOUT',
      attemptedPts: pts
    });
    return jsonResponse({ code: 'ERR_AUDIT_FAIL', message: 'تم تجميد الحساب تلقائياً لعدم تطابق السجل.' }, 403);
  }

  // خصم فوري وتجميد لمدة ساعة للمراجعة الخلفية قبل التحويل للمتجر
  const txId = `cash_${crypto.randomUUID()}`;
  const now = Date.now();
  await fbPatch(env, `arena_world/players/${player.phone}`, { points: player.points - pts });
  await appendDailyLedger(env, player.phone, { txId, type: 'cashout_pending', delta: -pts, at: now });
  await fbPatch(env, `arena_world/pending_cashouts/${txId}`, {
    phone: player.phone,
    pts,
    status: 'pending_audit',
    createdAt: now,
    releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });

  return jsonResponse({ ok: true, txId, releaseAt: now + CASHOUT_AUDIT_DELAY_MS });
}

// خوارزمية تدقيق السجل المتدحرج (آخر 7 أيام)
async function auditRollingLedger(env, player) {
  const days = await fbGet(env, `arena_world/ledger/${player.phone}`);
  let sumDelta = 0;
  if (days) {
    for (const dayKey of Object.keys(days)) {
      const entries = days[dayKey];
      for (const txKey of Object.keys(entries)) {
        sumDelta += Number(entries[txKey].delta || 0);
      }
    }
  }
  const expectedBalance = Number(player.verifiedCheckpointBalance || 0) + sumDelta;
  return expectedBalance === Number(player.points);
}

async function appendDailyLedger(env, phone, entry) {
  const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await fbPatch(env, `arena_world/ledger/${phone}/${dayKey}/${entry.txId}`, entry);
}

// دوال مساعدة للاتصال بـ Firebase REST API
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
  const res = await fetch(`${env.FIREBASE_DB_URL}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`);
  return res.ok ? res.json() : null;
}

async function fbPatch(env, path, data) {
  return fetch(`${env.FIREBASE_DB_URL}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

function jsonResponse(data, status = 200) {
  return corsResponse(JSON.stringify(data), status, { 'Content-Type': 'application/json' });
}

function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  });
}
