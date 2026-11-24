/**
 * Moaath Arena World - Cloudflare Worker (v2.0 - Step 2)
 * المسار في GitHub: worker/arena_worker.js
 * السياسة الأمنية: 0% ذكاء اصطناعي في المال أو النقاط أو التحويلات.
 */

const ALLOWED_CASHOUT_TIERS = [100, 200, 500, 1000];
const CASHOUT_AUDIT_DELAY_MS = 60 * 60 * 1000; // ساعة واحدة للتدقيق الخلفي
const ROLLING_LEDGER_DAYS = 7;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsResponse(null, 204);
    if (request.method !== 'POST') return jsonResponse({ code: 'ERR_METHOD', message: 'POST only' }, 405);

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    // 1. فحص زر الطوارئ (Kill Switch)
    const config = (await fbGet(env, 'arena_world/config')) || {};
    if (config.killSwitch === true) {
      return jsonResponse({ maintenance: true, message: 'قيد التطوير' }, 503);
    }

    // 2. ربط الجهاز لأول مرة بمفتاح المتجر
    if (url.pathname === '/auth/bind') {
      return handleBindDevice(env, body, config);
    }

    // 3. التحقق من توقيع جلسة اللاعب
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const player = await verifyDeviceToken(env, token);
    if (!player) return jsonResponse({ code: 'ERR_AUTH_01', message: 'جلسة غير صالحة، أعد ربط الجهاز.' }, 401);
    if (player.frozen) return jsonResponse({ code: 'ERR_FROZEN', message: 'الحساب مجمد للمراجعة الأمنية.' }, 403);

    // 4. توجيه نقاط النهاية
    switch (url.pathname) {
      case '/player/profile':
        return handleProfile(env, player);
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
  }
};

// ==========================================
// 1. المصادقة والملف الشخصي
// ==========================================
async function handleBindDevice(env, { bindKey, deviceId }, config) {
  if (!bindKey || !deviceId) return jsonResponse({ code: 'ERR_BIND_01', message: 'بيانات ناقصة' }, 400);

  const keyData = await fbGet(env, `arena_world/bind_keys/${bindKey}`);
  if (!keyData || keyData.used) {
    return jsonResponse({ code: 'ERR_BIND_02', message: 'المعرف غير صحيح أو مستخدم مسبقاً.' }, 403);
  }

  const existingDevice = await fbGet(env, `arena_world/devices/${deviceId}`);
  if (existingDevice && existingDevice.phone !== keyData.phone) {
    return jsonResponse({ code: 'ERR_MULTI_ACC', message: 'هذا الجهاز مرتبط بحساب آخر بالفعل.' }, 403);
  }

  const deviceToken = crypto.randomUUID() + '.' + Date.now();
  await fbPatch(env, `arena_world/bind_keys/${bindKey}`, { used: true, usedAt: Date.now() });
  await fbPatch(env, `arena_world/devices/${deviceId}`, { phone: keyData.phone, token: deviceToken });

  const playerPath = `arena_world/players/${keyData.phone}`;
  const existingPlayer = await fbGet(env, playerPath);
  if (!existingPlayer) {
    const welcomePts = Number(config.welcomePoints || 0);
    await fbPatch(env, playerPath, {
      phone: keyData.phone,
      displayName: keyData.displayName || 'لاعب جديد',
      points: welcomePts,
      verifiedCheckpointBalance: welcomePts,
      xp: 0,
      wins: 0,
      losses: 0,
      recordsBroken: 0,
      frozen: false,
      antiCheatFlags: 0,
      deviceToken
    });
  } else {
    await fbPatch(env, playerPath, { deviceToken });
  }

  return jsonResponse({ ok: true, deviceToken });
}

async function handleProfile(env, player) {
  const records = (await fbGet(env, 'arena_world/admin_records')) || {
    hill_drive: { title: 'قيادة التلال 2D', currentRecord: 350, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 },
    cyber_shooter: { title: 'ميجا شوتر 2D', currentRecord: 500, holderName: 'إدارة العالم', entryCostPts: 10, jackpotPts: 100 }
  };
  return jsonResponse({
    displayName: player.displayName,
    phone: player.phone,
    points: player.points,
    xp: player.xp || 0,
    wins: player.wins || 0,
    losses: player.losses || 0,
    records
  });
}

// ==========================================
// 2. إدارة الجلسات + كسر الأرقام القياسية + منع الغش الفيزيائي
// ==========================================
async function handleSessionStart(env, player, { gameId, mode, stakePts, pvpMatchId }, config) {
  if (!['hill_drive', 'cyber_shooter'].includes(gameId)) {
    return jsonResponse({ code: 'ERR_GAME', message: 'لعبة غير مدعومة.' }, 400);
  }

  const playMode = mode || 'record'; // 'record' | 'pvp_create' | 'pvp_join'
  let cost = Number(stakePts) || 10;

  if (playMode === 'record') {
    const rec = await fbGet(env, `arena_world/admin_records/${gameId}`);
    cost = rec ? Number(rec.entryCostPts || 10) : 10;
  }

  if (cost < 0 || player.points < cost) {
    return jsonResponse({ code: 'ERR_FUNDS', message: 'رصيد عملات معاذ غير كافٍ.' }, 400);
  }

  const sessionId = `ses_${crypto.randomUUID()}`;
  const now = Date.now();
  const seed = Math.floor(Math.random() * 999999);

  // خصم فوري عند بدء الجلسة (بعد انتهاء عداد الـ 5 ثواني)
  await updatePlayerBalance(env, player, -cost, {
    txId: sessionId,
    type: `entry_${playMode}`,
    delta: -cost,
    at: now
  });

  // في نمط كسر الرقم القياسي: 60% من رسم الدخول يضاف لتراكم الجائزة الكبرى (Jackpot)
  if (playMode === 'record' && cost > 0) {
    const rec = (await fbGet(env, `arena_world/admin_records/${gameId}`)) || {
      title: gameId === 'hill_drive' ? 'قيادة التلال 2D' : 'ميجا شوتر 2D',
      currentRecord: gameId === 'hill_drive' ? 350 : 500,
      holderName: 'إدارة العالم',
      entryCostPts: cost,
      jackpotPts: 100
    };
    const jackpotAdd = Math.floor(cost * 0.6);
    await fbPatch(env, `arena_world/admin_records/${gameId}`, {
      ...rec,
      jackpotPts: Number(rec.jackpotPts || 100) + jackpotAdd
    });
  }

  await fbPatch(env, `arena_world/sessions/${sessionId}`, {
    phone: player.phone,
    gameId,
    mode: playMode,
    stakePts: cost,
    pvpMatchId: pvpMatchId || null,
    seed,
    startedAt: now,
    expiresAt: now + 10 * 60 * 1000,
    consumed: false
  });

  return jsonResponse({ ok: true, sessionId, seed, startedAt: now });
}

async function handleSessionSubmit(env, player, { sessionId, score, telemetry }, config) {
  if (!sessionId || typeof score !== 'number' || !telemetry) {
    return jsonResponse({ code: 'ERR_SUBMIT_01', message: 'بيانات النتيجة ناقصة.' }, 400);
  }

  const session = await fbGet(env, `arena_world/sessions/${sessionId}`);
  if (!session || session.phone !== player.phone) {
    return jsonResponse({ code: 'ERR_SES_INVALID', message: 'جلسة غير صالحة.' }, 403);
  }
  if (session.consumed) {
    await flagAndFreeze(env, player, 'REPLAY_ATTACK_ATTEMPT', { sessionId });
    return jsonResponse({ code: 'ERR_REPLAY', message: 'محاولة إعادة إرسال نتيجة مكررة! تم تجميد الحساب.' }, 403);
  }

  // قفل الجلسة فوراً لمنع إعادة الاستخدام
  await fbPatch(env, `arena_world/sessions/${sessionId}`, { consumed: true, submittedAt: Date.now() });

  // التحقق الفيزيائي والزمني الصارم (Telemetry Anti-Cheat)
  const check = validateTelemetry(session, score, telemetry);
  if (!check.valid) {
    await flagAndFreeze(env, player, check.reason, { sessionId, score, telemetry });
    return jsonResponse({ code: 'ERR_CHEAT', message: 'تم رصد تلاعب في النتيجة وتجميد الحساب وإشعار الإدارة.' }, 403);
  }

  const now = Date.now();
  let rewardPts = 0;
  let xpGain = Math.min(50, Math.max(5, Math.floor(score / 25)));
  let outcomeMsg = `تم تسجيل نتيجتك: ${score}`;

  // أ) نمط كسر الرقم القياسي
  if (session.mode === 'record') {
    const rec = await fbGet(env, `arena_world/admin_records/${session.gameId}`);
    if (rec && score > Number(rec.currentRecord || 0)) {
      rewardPts = Number(rec.jackpotPts || 100);
      await updatePlayerBalance(env, player, rewardPts, {
        txId: `win_rec_${sessionId}`,
        type: 'record_broken',
        delta: rewardPts,
        at: now
      });
      // تصفير الجائزة للحد الأساسي وتسجيل البطل الجديد
      await fbPatch(env, `arena_world/admin_records/${session.gameId}`, {
        currentRecord: score,
        holderName: player.displayName,
        holderPhone: player.phone,
        jackpotPts: 50
      });
      await fbPatch(env, `arena_world/players/${player.phone}`, {
        recordsBroken: (player.recordsBroken || 0) + 1
      });
      outcomeMsg = `🔥 مبروك! كسرت الرقم القياسي وربحت الجائزة الكبرى (${rewardPts} عملة معاذ)!`;
    } else {
      outcomeMsg = `انتهت الجولة بنتيجة ${score}. الرقم القياسي الحالي: ${rec ? rec.currentRecord : 0}`;
    }
  }

  // ب) نمط إنشاء تحدي PvP غير متزامن
  if (session.mode === 'pvp_create') {
    const matchId = `pvp_${crypto.randomUUID().slice(0, 8)}`;
    await fbPatch(env, `arena_world/pvp_matches/${matchId}`, {
      matchId,
      gameId: session.gameId,
      creatorPhone: player.phone,
      creatorName: player.displayName,
      creatorScore: score,
      stakePts: session.stakePts,
      seed: session.seed,
      status: 'open',
      createdAt: now
    });
    outcomeMsg = `تم نشر تحديك في الساحة بنتيجة (${score}) ورهان (${session.stakePts} عملة)! رقم التحدي: ${matchId}`;
  }

  // ج) نمط قبول تحدي PvP
  if (session.mode === 'pvp_join' && session.pvpMatchId) {
    const match = await fbGet(env, `arena_world/pvp_matches/${session.pvpMatchId}`);
    if (match && match.status === 'open') {
      const pot = Number(match.stakePts) * 2;
      const houseEdgePct = Number(config.pvpHouseEdgePct || 10);
      const fee = Math.floor(pot * (houseEdgePct / 100));
      const prize = pot - fee;

      // نصف العمولة يغذي جائزة كسر الأرقام القياسية
      const rec = await fbGet(env, `arena_world/admin_records/${match.gameId}`);
      if (rec) {
        await fbPatch(env, `arena_world/admin_records/${match.gameId}`, {
          jackpotPts: Number(rec.jackpotPts || 100) + Math.floor(fee / 2)
        });
      }

      let winnerPhone = null;
      if (score > match.creatorScore) {
        winnerPhone = player.phone;
        rewardPts = prize;
        await updatePlayerBalance(env, player, prize, {
          txId: `pvp_win_${match.matchId}`,
          type: 'pvp_win',
          delta: prize,
          at: now
        });
        await fbPatch(env, `arena_world/players/${player.phone}`, { wins: (player.wins || 0) + 1 });
        outcomeMsg = `🏆 فزت بالتحدي! (${score} مقابل ${match.creatorScore}) وربحت ${prize} عملة معاذ!`;
      } else if (score < match.creatorScore) {
        winnerPhone = match.creatorPhone;
        const creator = await fbGet(env, `arena_world/players/${match.creatorPhone}`);
        if (creator) {
          await updatePlayerBalance(env, creator, prize, {
            txId: `pvp_win_${match.matchId}`,
            type: 'pvp_win',
            delta: prize,
            at: now
          });
          await fbPatch(env, `arena_world/players/${creator.phone}`, { wins: (creator.wins || 0) + 1 });
        }
        await fbPatch(env, `arena_world/players/${player.phone}`, { losses: (player.losses || 0) + 1 });
        outcomeMsg = `خسرت التحدي (${score} مقابل ${match.creatorScore}). حظاً أوفر في الجولة القادمة!`;
      } else {
        // تعادل: إعادة الرهان ناقص رسوم رمزية لكل لاعب
        const refund = Math.floor(prize / 2);
        await updatePlayerBalance(env, player, refund, { txId: `pvp_draw_${match.matchId}`, type: 'pvp_draw', delta: refund, at: now });
        const creator = await fbGet(env, `arena_world/players/${match.creatorPhone}`);
        if (creator) {
          await updatePlayerBalance(env, creator, refund, { txId: `pvp_draw_${match.matchId}`, type: 'pvp_draw', delta: refund, at: now });
        }
        outcomeMsg = `تعادل مثير (${score} مقابل ${match.creatorScore})! تم إعادة ${refund} عملة لكل لاعب.`;
      }

      await fbPatch(env, `arena_world/pvp_matches/${match.matchId}`, {
        opponentPhone: player.phone,
        opponentName: player.displayName,
        opponentScore: score,
        winnerPhone,
        status: 'completed',
        completedAt: now
      });
    }
  }

  // إضافة XP (للمظاهر فقط، لا يؤثر على النقاط المالية)
  await fbPatch(env, `arena_world/players/${player.phone}`, { xp: (player.xp || 0) + xpGain });

  return jsonResponse({ ok: true, score, rewardPts, xpGain, message: outcomeMsg });
}

// خوارزمية التحقق الفيزيائي من بصمة الجلسة (Telemetry Anti-Cheat)
function validateTelemetry(session, score, telemetry) {
  const serverElapsedSec = (Date.now() - session.startedAt) / 1000;
  const clientElapsedSec = Number(telemetry.durationSec || 0);

  // 1. منع التلاعب بساعة الجهاز أو الإنهاء السريع المستحيل
  if (serverElapsedSec < 2 || Math.abs(serverElapsedSec - clientElapsedSec) > 15) {
    return { valid: false, reason: 'TIME_TAMPERING_DETECTED' };
  }
  if (score < 0 || !Array.isArray(telemetry.snapshots) || telemetry.snapshots.length === 0) {
    return { valid: false, reason: 'MISSING_TELEMETRY_SNAPSHOTS' };
  }

  // 2. التحقق الخاص بلعبة القيادة 2D (أقصى سرعة فيزيائية ممكنة = 45 نقطة/ثانية)
  if (session.gameId === 'hill_drive') {
    const maxPossibleScore = Math.ceil(serverElapsedSec * 45) + 50;
    if (score > maxPossibleScore) {
      return { valid: false, reason: 'HILL_DRIVE_SPEEDHACK' };
    }
  }

  // 3. التحقق الخاص بلعبة إطلاق النار 2D (أقصى معدل نقاط = 60 نقطة/ثانية)
  if (session.gameId === 'cyber_shooter') {
    const maxPossibleScore = Math.ceil(serverElapsedSec * 60) + 60;
    if (score > maxPossibleScore || Number(telemetry.kills || 0) > Math.ceil(serverElapsedSec * 3.5)) {
      return { valid: false, reason: 'SHOOTER_SCORE_ANOMALY' };
    }
  }

  return { valid: true };
}

// ==========================================
// 3. تحديات PvP (قائمة وإنشاء وانضمام)
// ==========================================
async function handlePvpList(env) {
  const matches = (await fbGet(env, 'arena_world/pvp_matches')) || {};
  const openList = Object.values(matches)
    .filter((m) => m.status === 'open')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  return jsonResponse({ ok: true, matches: openList });
}

async function handlePvpCreate(env, player, body, config) {
  return handleSessionStart(env, player, {
    gameId: body.gameId,
    mode: 'pvp_create',
    stakePts: Number(body.stakePts || 20)
  }, config);
}

async function handlePvpJoin(env, player, { matchId }, config) {
  const match = await fbGet(env, `arena_world/pvp_matches/${matchId}`);
  if (!match || match.status !== 'open') {
    return jsonResponse({ code: 'ERR_PVP_CLOSED', message: 'هذا التحدي لم يعد متاحاً.' }, 400);
  }
  if (match.creatorPhone === player.phone) {
    return jsonResponse({ code: 'ERR_PVP_SELF', message: 'لا يمكنك قبول تحديك الخاص.' }, 400);
  }
  return handleSessionStart(env, player, {
    gameId: match.gameId,
    mode: 'pvp_join',
    stakePts: match.stakePts,
    pvpMatchId: matchId
  }, config);
}

// ==========================================
// 4. السجل الأسبوعي المتدحرج (7 أيام) + سحب النقاط للمتجر
// ==========================================
async function updatePlayerBalance(env, player, delta, ledgerEntry) {
  const currentPts = Number(player.points || 0);
  const newPts = currentPts + delta;
  player.points = newPts;

  await fbPatch(env, `arena_world/players/${player.phone}`, { points: newPts });
  await appendDailyLedgerAndPrune(env, player, ledgerEntry);
}

async function appendDailyLedgerAndPrune(env, player, entry) {
  const dayKey = new Date().toISOString().slice(0, 10);
  await fbPatch(env, `arena_world/ledger/${player.phone}/${dayKey}/${entry.txId}`, entry);

  // فحص وتنظيف الأيام الأقدم من 7 أيام مع تحديث نقطة التثبيت الموثقة
  const days = await fbGet(env, `arena_world/ledger/${player.phone}`);
  if (!days) return;
  const sortedDays = Object.keys(days).sort();
  if (sortedDays.length > ROLLING_LEDGER_DAYS) {
    const oldestDay = sortedDays[0];
    let dayNet = 0;
    for (const txKey of Object.keys(days[oldestDay])) {
      dayNet += Number(days[oldestDay][txKey].delta || 0);
    }
    const newCheckpoint = Number(player.verifiedCheckpointBalance || 0) + dayNet;
    await fbPatch(env, `arena_world/players/${player.phone}`, {
      verifiedCheckpointBalance: newCheckpoint,
      lastPrunedDay: oldestDay
    });
    await fbDelete(env, `arena_world/ledger/${player.phone}/${oldestDay}`);
  }
}

async function handleCashoutRequest(env, player, { tierPts }, config) {
  const pts = Number(tierPts);
  const minCashout = Number(config.minCashoutPts || 100);

  if (!ALLOWED_CASHOUT_TIERS.includes(pts) || pts < minCashout) {
    return jsonResponse({ code: 'ERR_TIER', message: `فئة السحب غير مسموحة. الفئات: ${ALLOWED_CASHOUT_TIERS.join(', ')}` }, 400);
  }
  if (player.points < pts) {
    return jsonResponse({ code: 'ERR_FUNDS', message: 'الرصيد غير كافٍ.' }, 400);
  }

  // تدقيق رياضي كامل للسجل المتدحرج (آخر 7 أيام + نقطة التثبيت)
  const days = await fbGet(env, `arena_world/ledger/${player.phone}`);
  let sumDelta = 0;
  if (days) {
    for (const dayKey of Object.keys(days)) {
      for (const txKey of Object.keys(days[dayKey])) {
        sumDelta += Number(days[dayKey][txKey].delta || 0);
      }
    }
  }
  const expectedBalance = Number(player.verifiedCheckpointBalance || 0) + sumDelta;
  if (expectedBalance !== Number(player.points)) {
    await flagAndFreeze(env, player, 'LEDGER_MISMATCH_ON_CASHOUT', { expectedBalance, actual: player.points });
    return jsonResponse({ code: 'ERR_AUDIT_FAIL', message: 'تم تجميد الحساب تلقائياً لعدم تطابق السجل.' }, 403);
  }

  const txId = `cash_${crypto.randomUUID()}`;
  const now = Date.now();
  const usdRate = Number(config.coinToUsdRate || 0.01); // مثلاً 100 عملة = 1 دولار
  const usdAmount = Number((pts * usdRate).toFixed(4));

  await updatePlayerBalance(env, player, -pts, { txId, type: 'cashout_pending', delta: -pts, at: now });
  await fbPatch(env, `arena_world/pending_cashouts/${txId}`, {
    phone: player.phone,
    pts,
    usdAmount,
    status: 'pending_audit',
    createdAt: now,
    releaseAt: now + CASHOUT_AUDIT_DELAY_MS
  });

  return jsonResponse({ ok: true, txId, usdAmount, releaseAt: now + CASHOUT_AUDIT_DELAY_MS });
}

async function flagAndFreeze(env, player, reason, details) {
  await fbPatch(env, `arena_world/players/${player.phone}`, {
    frozen: true,
    antiCheatFlags: (player.antiCheatFlags || 0) + 1
  });
  await fbPatch(env, `arena_world/admin_alerts/${Date.now()}`, {
    phone: player.phone,
    reason,
    details,
    at: Date.now()
  });
}

// ==========================================
// دوال مساعدة لـ Firebase و CORS
// ==========================================
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

async function fbDelete(env, path) {
  return fetch(`${env.FIREBASE_DB_URL}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, {
    method: 'DELETE'
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
