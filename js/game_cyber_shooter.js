/**
 * لعبة ميجا شوتر 2D (Cyber Shooter - Robots, Drones, Mini-Boss, Dash, Combo & Web Audio Edition)
 * المسار في GitHub: js/game_cyber_shooter.js
 * - استبدال المربعات بروبوتات أرضية وطائرات مسيّرة مرسومة + زعيم موجة (Mini-Boss) كل 15 عدواً.
 * - نظام الانزلاق (Dash) لتفادي الطلقات والأعداء + نظام سلسلة القضاء (Combo Multiplier).
 * - تفعيل أداة القلب الإضافي (+1 HP -> extra_hp) ودرع الحماية (shield_1).
 * - مؤثرات صوتية برمجية خفيفة 100% عبر Web Audio API (0 ملفات خارجية).
 */
window.CyberShooterGame = {
  running: false,
  rafId: null,
  audioCtx: null,

  initAudio() {
    if (localStorage.getItem('arena_data_saver') === '1') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audioCtx = new AC();
    } catch (e) {}
  },

  playTone(freq, duration = 0.1, type = 'square', vol = 0.055, slideTo = null) {
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  },

  stopAudio() {
    try {
      if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    } catch (e) {}
  },

  start(canvas, seed, onFinish, options = {}) {
    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    };
    resize();

    this.running = true;
    this.initAudio();

    const startTime = Date.now();
    let lastSnapTime = startTime;
    const snapshots = [];

    const charObj = window.ArenaVoice ? window.ArenaVoice.getChar(options.characterId) : { color: '#38bdf8' };
    const auraColor = charObj.color || '#38bdf8';

    // تحميل صورة الشخصية
    const avatarImg = new Image();
    let avatarLoaded = false;
    if (window.ArenaVoice && options.characterId) {
      avatarImg.onload = () => { avatarLoaded = true; };
      avatarImg.src = window.ArenaVoice.getCharImgUrl(options.characterId);
    }

    // الأدوات التكتيكية
    let hasShield = options.activeItem === 'shield_1';
    const startHp = options.activeItem === 'extra_hp' ? 4 : 3;

    const groundY = () => canvas.height * 0.80;
    const player = {
      x: 92, y: groundY() - 42, vy: 0,
      hp: startHp, maxHp: startHp,
      jumpsLeft: 2,
      invuln: 0,
      dashFrames: 0,
      dashCooldown: 0,
      jumpRing: null
    };

    const bullets = [];
    const enemies = [];
    const particles = [];
    const popups = [];
    let score = 0;
    let kills = 0;
    let shots = 0;
    let combo = 0;
    let nextBossKillTarget = 15;
    let hitStopFrames = 0;
    let shakeFrames = 0;
    let frame = 0;
    let firing = false;
    let lastShotFrame = 0;
    let rngState = seed || 12345;

    const nextRand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    const btnJump = document.getElementById('btnGameLeft');
    const btnShoot = document.getElementById('btnGameRight');
    btnJump.innerHTML = '⬆️<small>قفز / اندفاع</small>';
    btnShoot.innerHTML = '🔥<small>إطلاق</small>';

    // نقرة القفز: في الهواء ينفذ اندفاعاً (Dash) إذا كان متاحاً، وعلى الأرض ينفذ قفزة أو قفزة مزدوجة
    btnJump.onpointerdown = (e) => {
      e.preventDefault();
      btnJump.classList.add('pressed');
      const gY = groundY();
      const inAir = player.y < gY - 46;

      if (inAir && player.dashCooldown <= 0 && player.dashFrames <= 0) {
        player.dashFrames = 11;
        player.dashCooldown = 55;
        player.vy = 0;
        player.invuln = Math.max(player.invuln, 14);
        this.playTone(760, 0.11, 'triangle', 0.07, 1240);
        for (let k = 0; k < 7; k++) {
          particles.push({ x: player.x, y: player.y + 20, vx: -4 - Math.random() * 3, vy: (Math.random() - 0.5) * 3, life: 0.8, color: auraColor });
        }
        return;
      }

      if (player.jumpsLeft > 0) {
        const isDouble = player.jumpsLeft === 1;
        player.vy = -12.4;
        player.jumpsLeft--;
        this.playTone(isDouble ? 540 : 360, 0.11, 'sine', 0.07, isDouble ? 920 : 620);
        if (isDouble) {
          player.jumpRing = { x: player.x + 14, y: player.y + 42, r: 6, alpha: 0.9 };
        }
      }
    };
    btnJump.onpointerup = btnJump.onpointerleave = btnJump.onpointercancel = () => btnJump.classList.remove('pressed');

    const setFire = (v) => (e) => { e.preventDefault(); firing = v; btnShoot.classList.toggle('pressed', v); };
    btnShoot.onpointerdown = setFire(true);
    btnShoot.onpointerup = btnShoot.onpointerleave = btnShoot.onpointercancel = setFire(false);

    const spawnEnemy = (isBoss = false) => {
      const gY = groundY();
      if (isBoss) {
        enemies.push({
          kind: 'boss',
          x: canvas.width + 45,
          y: gY - 68,
          vx: -1.8,
          w: 64, h: 68,
          hp: 12, maxHp: 12,
          pts: 120
        });
        popups.push({ x: canvas.width * 0.65, y: gY - 125, text: '⚠️ زعيم الموجة!', life: 1.8, color: '#ef4444' });
        this.playTone(160, 0.35, 'sawtooth', 0.09, 95);
        return;
      }

      const roll = nextRand();
      if (roll > 0.54) {
        // طائرة مسيّرة (Drone)
        enemies.push({
          kind: 'drone',
          x: canvas.width + 26,
          y: gY - 96,
          vx: -(3.8 + Math.min(4.5, kills * 0.07)),
          w: 34, h: 24,
          hp: 1, maxHp: 1,
          pts: 20
        });
      } else {
        // روبوت أرضي مدرّع (Robot)
        const armored = kills >= 4 && nextRand() > 0.45;
        enemies.push({
          kind: 'robot',
          x: canvas.width + 26,
          y: gY - 38,
          vx: -(3.2 + Math.min(4.0, kills * 0.06)),
          w: 32, h: 38,
          hp: armored ? 2 : 1, maxHp: armored ? 2 : 1,
          pts: armored ? 30 : 20
        });
      }
    };

    const spawnBurst = (x, y, color, count = 10) => {
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = 2 + Math.random() * 4.5;
        particles.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1,
          life: 1,
          color
        });
      }
    };

    const endGame = (reason) => {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.rafId);
      this.stopAudio();
      const durationSec = (Date.now() - startTime) / 1000;
      snapshots.push({ t: Math.round(durationSec), s: score, k: kills, maxCombo: combo });
      onFinish(score, { durationSec, kills, shots, reason, snapshots });
    };

    const loop = () => {
      if (!this.running) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();

      if (hitStopFrames > 0) {
        hitStopFrames--;
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      frame++;
      const now = Date.now();
      const gY = groundY();

      // إطلاق نار مستمر مع مضاعف Combo
      if (firing && frame - lastShotFrame >= 10 && bullets.length < 8) {
        const mult = 1 + Math.floor(combo / 5);
        bullets.push({ x: player.x + 32, y: player.y + 18, vx: 13, mult });
        shots++;
        lastShotFrame = frame;
        this.playTone(980, 0.06, 'square', 0.04, 520);
      }

      // فيزياء اللاعب + الانزلاق
      if (player.dashFrames > 0) {
        player.dashFrames--;
        player.x = Math.min(canvas.width * 0.48, player.x + 11);
      } else {
        player.x += (92 - player.x) * 0.12;
        player.vy += 0.65;
        player.y += player.vy;
      }

      if (player.dashCooldown > 0) player.dashCooldown--;
      if (player.invuln > 0) player.invuln--;

      if (player.y >= gY - 42) {
        player.y = gY - 42;
        player.vy = 0;
        player.jumpsLeft = 2;
      }

      if (player.jumpRing) {
        player.jumpRing.r += 3.2;
        player.jumpRing.alpha -= 0.07;
        if (player.jumpRing.alpha <= 0) player.jumpRing = null;
      }

      // استدعاء زعيم الموجة كل 15 عدواً أو الأعداء العاديين
      const hasBoss = enemies.some((e) => e.kind === 'boss');
      if (!hasBoss && kills >= nextBossKillTarget) {
        nextBossKillTarget += 15;
        spawnEnemy(true);
      } else if (!hasBoss) {
        const spawnRate = Math.max(34, 82 - Math.floor(kills / 3));
        if (frame % spawnRate === 0) spawnEnemy(false);
      }

      // حركة الرصاص والتصادم
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        if (b.x > canvas.width + 20) { bullets.splice(i, 1); continue; }

        for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (Math.abs(b.x - en.x) < en.w * 0.55 && Math.abs(b.y - en.y) < en.h * 0.55) {
            bullets.splice(i, 1);
            en.hp--;
            this.playTone(420, 0.07, 'triangle', 0.06, 220);

            if (en.hp <= 0) {
              kills++;
              combo++;
              const comboMult = 1 + Math.floor(combo / 5);
              const gained = en.pts * comboMult;
              score += gained;
              const burstColor = en.kind === 'boss' ? '#f3d576' : (en.kind === 'drone' ? '#38bdf8' : '#ef4444');
              spawnBurst(en.x, en.y, burstColor, en.kind === 'boss' ? 22 : 10);
              popups.push({
                x: en.x, y: en.y - 14,
                text: comboMult > 1 ? `+${gained} (x${comboMult})` : `+${gained}`,
                life: 1.15,
                color: comboMult > 1 ? '#4ade80' : '#f3d576'
              });
              this.playTone(240, 0.14, 'sawtooth', 0.07, 90);

              if (en.kind === 'boss') {
                hitStopFrames = 3;
                shakeFrames = 12;
                score += 100;
                popups.push({ x: en.x, y: en.y - 36, text: '👑 هزيمة الزعيم +100!', life: 1.7, color: '#f3d576' });
              }
              enemies.splice(j, 1);
            }
            break;
          }
        }
      }

      // حركة الأعداء والتصادم مع اللاعب
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx;
        if (en.kind === 'drone') {
          en.y = gY - 96 + Math.sin(frame * 0.08 + i) * 14;
        }

        if (player.invuln === 0 && Math.abs(en.x - (player.x + 14)) < (en.w * 0.45 + 14) && Math.abs(en.y - (player.y + 20)) < (en.h * 0.45 + 18)) {
          if (en.kind !== 'boss') enemies.splice(i, 1);
          combo = 0;

          if (hasShield) {
            hasShield = false;
            player.invuln = 48;
            shakeFrames = 7;
            popups.push({ x: player.x + 14, y: player.y - 16, text: '🛡️ صدّ الدرع!', life: 1.3, color: '#38bdf8' });
            this.playTone(520, 0.16, 'triangle', 0.08, 860);
          } else {
            player.hp--;
            player.invuln = 48;
            shakeFrames = 9;
            spawnBurst(player.x + 14, player.y + 20, '#ef4444', 10);
            this.playTone(150, 0.22, 'sawtooth', 0.09, 65);
            if (player.hp <= 0) return endGame('defeated');
          }
        } else if (en.x < -80) {
          enemies.splice(i, 1);
        }
      }

      if (frame % 60 === 0) score += 2;
      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: score, k: kills, maxCombo: combo });
      }

      // ================= الرسم =================
      ctx.save();
      if (shakeFrames > 0) {
        ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
        shakeFrames--;
      }

      // خلفية مدينة مستقبلية متحركة
      ctx.fillStyle = '#070d1d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0c162b';
      const farOffset = (frame * 0.35) % 130;
      for (let bx = -farOffset; bx < canvas.width + 130; bx += 130) {
        const bh = 95 + ((Math.floor((bx + farOffset) / 130) * 53) % 90);
        ctx.fillRect(bx, gY - bh, 80, bh);
      }

      ctx.fillStyle = '#13223f';
      const nearOffset = (frame * 0.9) % 95;
      for (let bx = -nearOffset; bx < canvas.width + 95; bx += 95) {
        const bh = 55 + ((Math.floor((bx + nearOffset) / 95) * 37) % 65);
        ctx.fillRect(bx, gY - bh, 52, bh);
      }

      // الأرضية
      ctx.fillStyle = '#152542';
      ctx.fillRect(0, gY, canvas.width, canvas.height - gY);
      ctx.fillStyle = auraColor;
      ctx.fillRect(0, gY, canvas.width, 3);

      // حلقة القفز المزدوج
      if (player.jumpRing) {
        ctx.globalAlpha = Math.max(0, player.jumpRing.alpha);
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(player.jumpRing.x, player.jumpRing.y, player.jumpRing.r * 1.4, player.jumpRing.r * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // رسم اللاعب (مع الأجنحة والدرع وصورة الشخصية)
      ctx.save();
      if (player.invuln > 0 && frame % 6 < 3) ctx.globalAlpha = 0.45;
      if (hasShield) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(player.x + 14, player.y + 20, 32, 0, Math.PI * 2); ctx.stroke();
      }

      // أجنحة الطاقة
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y + 18);
      ctx.lineTo(player.x - 20, player.y + 3);
      ctx.lineTo(player.x - 11, player.y + 29);
      ctx.closePath();
      ctx.fill();

      // الجسم والسلاح
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(player.x, player.y + 14, 28, 28);
      ctx.fillStyle = auraColor;
      ctx.fillRect(player.x + 22, player.y + 16, 15, 7);

      // رأس الشخصية
      if (avatarLoaded) {
        ctx.save();
        ctx.beginPath(); ctx.arc(player.x + 14, player.y + 6, 12, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, player.x + 2, player.y - 6, 24, 24);
        ctx.restore();
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(player.x + 14, player.y + 6, 12, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(player.x + 4, player.y, 20, 16);
      }
      ctx.restore();

      // رسم الرصاص
      bullets.forEach((b) => {
        ctx.fillStyle = b.mult > 1 ? '#4ade80' : auraColor;
        ctx.fillRect(b.x, b.y, 16, 5);
      });

      // رسم الأعداء المرسومة (روبوتات، طائرات مسيّرة، زعيم الموجة)
      enemies.forEach((en) => {
        if (en.kind === 'drone') {
          // طائرة مسيّرة (Drone)
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.ellipse(en.x, en.y, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath(); ctx.arc(en.x - 5, en.y, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(en.x - 14, en.y - 11); ctx.lineTo(en.x + 14, en.y - 11); ctx.stroke();
        } else if (en.kind === 'boss') {
          // زعيم الموجة (Mini-Boss)
          ctx.fillStyle = '#271226';
          ctx.strokeStyle = '#f3d576';
          ctx.lineWidth = 3;
          ctx.fillRect(en.x - 32, en.y - 34, 64, 68);
          ctx.strokeRect(en.x - 32, en.y - 34, 64, 68);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(en.x - 20, en.y - 16, 22, 10);
          ctx.fillStyle = '#f3d576';
          ctx.fillRect(en.x - 42, en.y + 4, 14, 8);
        } else {
          // روبوت أرضي
          ctx.fillStyle = en.hp > 1 ? '#7f1d1d' : '#1e293b';
          ctx.strokeStyle = en.hp > 1 ? '#f87171' : '#fb923c';
          ctx.lineWidth = 2;
          ctx.fillRect(en.x - 15, en.y - 18, 30, 36);
          ctx.strokeRect(en.x - 15, en.y - 18, 30, 36);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(en.x - 10, en.y - 11, 10, 6);
        }

        if (en.maxHp > 1) {
          const bw = en.kind === 'boss' ? 64 : 30;
          ctx.fillStyle = '#000';
          ctx.fillRect(en.x - bw * 0.5, en.y - en.h * 0.5 - 10, bw, 5);
          ctx.fillStyle = en.kind === 'boss' ? '#f3d576' : '#4ade80';
          ctx.fillRect(en.x - bw * 0.5, en.y - en.h * 0.5 - 10, (en.hp / en.maxHp) * bw, 5);
        }
      });

      // الجزيئات
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.04;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;

      // النصوص المتطايرة
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y -= 1.0; p.life -= 0.025;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color || '#f3d576';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // شريط HUD علوي
      ctx.fillStyle = 'rgba(11, 17, 32, 0.78)';
      ctx.fillRect(14, 12, 285, 52);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 12, 285, 52);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px sans-serif';
      const comboBadge = combo >= 5 ? `🔥 x${1 + Math.floor(combo / 5)}` : '';
      ctx.fillText(`النقاط: ${score}  |  🤖 ${kills}  ${comboBadge}`, 22, 31);

      const dashReady = player.dashCooldown <= 0 ? '⚡ اندفاع جاهز' : '⏳ اندفاع';
      ctx.fillText(`${'❤️'.repeat(player.hp)} ${hasShield ? '🛡️' : ''}  •  ${dashReady}`, 22, 52);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stopAudio();
  }
};
