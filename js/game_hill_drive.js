/**
 * لعبة قيادة التلال 2D (Hill Drive - Pro Physics, Coins, Air-Time & Web Audio Edition)
 * المسار في GitHub: js/game_hill_drive.js
 * - فيزياء عجلتين مستقلتين مع نوابض تعليق (Suspension) وتوازن واقعي.
 * - عملات ذهبية حتمية (Seed) على قمم التلال + مكافأة القفز الهوائي (Air-Time Bonus).
 * - مؤثرات صوتية برمجية خفيفة 100% عبر Web Audio API (0 ملفات خارجية).
 * - دعم كامل للأدوات التكتيكية: درع الحماية (shield_1)، خزان الوقود (fuel_boost)، ومغناطيس الوقود (fuel_magnet).
 */
window.HillDriveGame = {
  running: false,
  rafId: null,
  audioCtx: null,
  engineOsc: null,
  engineGain: null,

  initAudio() {
    if (localStorage.getItem('arena_data_saver') === '1') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audioCtx = new AC();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      gain.gain.value = 0.025;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      this.engineOsc = osc;
      this.engineGain = gain;
    } catch (e) {}
  },

  playTone(freq, duration = 0.12, type = 'sine', vol = 0.08, slideTo = null) {
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
      if (this.engineOsc) { this.engineOsc.stop(); this.engineOsc = null; }
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

    const charObj = window.ArenaVoice ? window.ArenaVoice.getChar(options.characterId) : { color: '#d4af37' };
    const auraColor = charObj.color || '#d4af37';
    const targetRecord = Number(options.recordScore || 0);
    let recordCelebrated = false;

    // تحميل صورة الشخصية للمقصورة
    const avatarImg = new Image();
    let avatarLoaded = false;
    if (window.ArenaVoice && options.characterId) {
      avatarImg.onload = () => { avatarLoaded = true; };
      avatarImg.src = window.ArenaVoice.getCharImgUrl(options.characterId);
    }

    // تفعيل الأدوات التكتيكية
    let hasShield = options.activeItem === 'shield_1';
    const hasMagnet = options.activeItem === 'fuel_magnet';
    const maxFuel = options.activeItem === 'fuel_boost' ? 125 : 100;

    // مولد تضاريس حتمي (Seed)
    const terrainHeight = (x) => {
      const s = (seed % 100) * 0.1;
      const base = canvas.height * 0.72;
      const difficulty = 1 + Math.min(0.45, Math.max(0, x) / 14000);
      return base +
        Math.sin(x * 0.0072 + s) * 44 * difficulty +
        Math.sin(x * 0.0185 + s * 2) * 18 * difficulty +
        Math.cos(x * 0.0031 + s) * 16;
    };

    // هيكل السيارة بفيزياء عجلتين + نوابض تعليق
    const wheelOffset = 20;
    const car = {
      x: 100, y: 100, vx: 0, vy: 0,
      angle: 0, angularVel: 0,
      fuel: maxFuel,
      rearComp: 0, frontComp: 0,
      onGround: false,
      airFrames: 0
    };

    const controls = { gas: false, brake: false };
    const particles = [];
    const popups = [];
    const coins = [];
    let nextCoinSpawnX = 280;
    let nextFuelX = 680;
    let distScore = 0;
    let bonusScore = 0;
    let coinsCollected = 0;
    let shieldFlash = 0;
    let shakeFrames = 0;
    let frame = 0;

    const spawnCoinsAhead = () => {
      while (nextCoinSpawnX < car.x + canvas.width + 500) {
        const y = terrainHeight(nextCoinSpawnX) - 24;
        coins.push({ x: nextCoinSpawnX, y, collected: false });
        nextCoinSpawnX += 165 + ((seed + coins.length * 37) % 80);
      }
    };
    spawnCoinsAhead();

    const btnGas = document.getElementById('btnGameRight');
    const btnBrake = document.getElementById('btnGameLeft');
    btnGas.innerHTML = '⛽<small>بنزين</small>';
    btnBrake.innerHTML = '🛑<small>فرامل</small>';

    const setGas = (v) => (e) => { e.preventDefault(); controls.gas = v; btnGas.classList.toggle('pressed', v); };
    const setBrake = (v) => (e) => { e.preventDefault(); controls.brake = v; btnBrake.classList.toggle('pressed', v); };

    btnGas.onpointerdown = setGas(true);
    btnGas.onpointerup = btnGas.onpointerleave = btnGas.onpointercancel = setGas(false);
    btnBrake.onpointerdown = setBrake(true);
    btnBrake.onpointerup = btnBrake.onpointerleave = btnBrake.onpointercancel = setBrake(false);

    const endGame = (reason) => {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.rafId);
      this.stopAudio();
      const durationSec = (Date.now() - startTime) / 1000;
      const totalScore = distScore + bonusScore;
      snapshots.push({ t: Math.round(durationSec), s: totalScore, f: Math.round(car.fuel), c: coinsCollected });
      onFinish(totalScore, { durationSec, reason, coins: coinsCollected, snapshots });
    };

    const loop = () => {
      if (!this.running) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();
      frame++;
      const now = Date.now();

      // 1. فيزياء التسارع والوقود
      if (controls.gas && car.fuel > 0) {
        car.vx += 0.27;
        car.fuel -= 0.11;
        if (frame % 2 === 0) {
          particles.push({ x: car.x - 26, y: car.y + 4, vx: -2.2 - Math.random() * 2, vy: -0.6 - Math.random(), life: 1, color: auraColor });
        }
      } else if (controls.brake) {
        car.vx -= 0.22;
      }
      car.vx *= 0.976;
      car.vx = Math.max(-4, Math.min(11.5, car.vx));
      car.x += car.vx;

      // تحديث صوت المحرك حسب السرعة
      if (this.engineOsc && this.audioCtx) {
        const targetFreq = 48 + Math.abs(car.vx) * 14 + (controls.gas ? 18 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.05);
      }

      // 2. فيزياء العجلتين المستقلتين ونوابض التعليق
      const rearX = car.x - Math.cos(car.angle) * wheelOffset;
      const frontX = car.x + Math.cos(car.angle) * wheelOffset;
      const rearGroundY = terrainHeight(rearX);
      const frontGroundY = terrainHeight(frontX);
      const midGroundY = (rearGroundY + frontGroundY) * 0.5;
      const slopeAngle = Math.atan2(frontGroundY - rearGroundY, wheelOffset * 2);

      const prevVy = car.vy;
      car.vy += 0.44;
      car.y += car.vy;

      if (car.y >= midGroundY - 20) {
        // لحظة الهبوط على الأرض
        if (!car.onGround) {
          if (prevVy > 6.5) {
            shakeFrames = 8;
            for (let k = 0; k < 6; k++) {
              particles.push({ x: car.x + (Math.random() - 0.5) * 30, y: midGroundY - 2, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3, life: 0.9, color: '#f3d576' });
            }
          }
          // مكافأة القفز الهوائي (Air-Time Bonus)
          if (car.airFrames >= 45 && Math.abs(car.angle - slopeAngle) < 0.85) {
            const airBonus = Math.min(25, Math.floor(car.airFrames / 15) * 5);
            bonusScore += airBonus;
            popups.push({ x: car.x, y: car.y - 36, text: `✈️ قفزة رائعة +${airBonus}`, life: 1.4, color: '#38bdf8' });
            this.playTone(520, 0.16, 'triangle', 0.09, 880);
          }
        }
        car.y = midGroundY - 20;
        car.vy = 0;
        car.onGround = true;
        car.airFrames = 0;

        // تليين زاوية السيارة نحو ميلان الأرض
        car.angle += (slopeAngle - car.angle) * 0.28;
        car.angularVel *= 0.6;

        // ضغط نوابض العجلتين
        car.rearComp = Math.max(-5, Math.min(7, (car.y + 20 - rearGroundY) * 0.35));
        car.frontComp = Math.max(-5, Math.min(7, (car.y + 20 - frontGroundY) * 0.35));
      } else {
        car.onGround = false;
        car.airFrames++;
        if (controls.gas) car.angularVel -= 0.0045;
        if (controls.brake) car.angularVel += 0.0045;
        car.angularVel *= 0.94;
        car.angle += car.angularVel;
        car.rearComp *= 0.85;
        car.frontComp *= 0.85;
      }

      // 3. العملات الذهبية
      spawnCoinsAhead();
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (!c.collected && Math.hypot(car.x - c.x, car.y - c.y) < 36) {
          c.collected = true;
          coinsCollected++;
          bonusScore += 3;
          popups.push({ x: c.x, y: c.y - 14, text: '+3 🪙', life: 1, color: '#f3d576' });
          this.playTone(880, 0.09, 'sine', 0.07, 1320);
        }
        if (c.x < car.x - 300 || c.collected) {
          if (c.collected) coins.splice(i, 1);
        }
      }

      // 4. التقاط الوقود + مغناطيس الوقود (fuel_magnet)
      const fuelY = terrainHeight(nextFuelX) - 24;
      const fuelDist = Math.hypot(car.x - nextFuelX, car.y - fuelY);
      const catchRadius = hasMagnet ? 135 : 40;
      if (fuelDist < catchRadius) {
        car.fuel = Math.min(maxFuel, car.fuel + 45);
        popups.push({ x: car.x, y: car.y - 34, text: hasMagnet ? '🧲 وقود!' : '⛽ +وقود!', life: 1.1, color: '#4ade80' });
        this.playTone(440, 0.14, 'triangle', 0.09, 720);
        nextFuelX += 680 + (seed % 150);
      }
      if (car.x > nextFuelX + 140) nextFuelX = car.x + 620;

      // 5. النقاط والرقم القياسي
      const d = Math.max(0, Math.floor((car.x - 100) / 10));
      if (d > distScore) distScore = d;
      const totalScore = distScore + bonusScore;
      car.fuel -= 0.03;

      if (targetRecord > 0 && !recordCelebrated && totalScore > targetRecord) {
        recordCelebrated = true;
        popups.push({ x: car.x, y: car.y - 54, text: '👑 رقم قياسي جديد!', life: 2.0, color: '#f3d576' });
        this.playTone(660, 0.25, 'triangle', 0.11, 1320);
      }

      // 6. فحص الانقلاب + درع الحماية
      if (Math.abs(car.angle) > 1.75 && car.onGround) {
        if (hasShield) {
          hasShield = false;
          shieldFlash = 28;
          shakeFrames = 10;
          car.angle = slopeAngle;
          car.vy = -7;
          popups.push({ x: car.x, y: car.y - 40, text: '🛡️ الدرع أنقذك!', life: 1.5, color: '#38bdf8' });
          this.playTone(300, 0.22, 'sawtooth', 0.09, 620);
        } else {
          this.playTone(180, 0.3, 'sawtooth', 0.1, 60);
          return endGame('flipped');
        }
      }
      if (car.fuel <= 0 && Math.abs(car.vx) < 0.2) return endGame('out_of_fuel');

      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: totalScore, f: Math.round(car.fuel), c: coinsCollected });
      }

      // ================= الرسم =================
      ctx.save();
      if (shakeFrames > 0) {
        ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
        shakeFrames--;
      }

      // خلفية متغيرة كل 250 متراً
      const zone = Math.floor(distScore / 250) % 3;
      const skyGrads = [
        ['#060b16', '#0f1f3d'],
        ['#130924', '#1e1b4b'],
        ['#071a1a', '#0f2933']
      ];
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, skyGrads[zone][0]);
      grad.addColorStop(1, skyGrads[zone][1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const camX = car.x - canvas.width * 0.26;

      // رسم التضاريس
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let sx = 0; sx <= canvas.width + 12; sx += 12) {
        ctx.lineTo(sx, terrainHeight(sx + camX));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fillStyle = '#152547';
      ctx.fill();
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // راية الرقم القياسي
      if (targetRecord > 0) {
        const recX = 100 + targetRecord * 10 - camX;
        if (recX > -40 && recX < canvas.width + 40) {
          const recY = terrainHeight(100 + targetRecord * 10);
          ctx.strokeStyle = '#f3d576';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(recX, recY); ctx.lineTo(recX, recY - 54); ctx.stroke();
          ctx.fillStyle = '#f3d576';
          ctx.fillRect(recX, recY - 54, 48, 18);
          ctx.fillStyle = '#060b16';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('👑 رقم', recX + 6, recY - 41);
        }
      }

      // رسم العملات الذهبية
      coins.forEach((c) => {
        const cx = c.x - camX;
        if (cx < -20 || cx > canvas.width + 20) return;
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(cx, c.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // رسم علبة الوقود
      const fx = nextFuelX - camX;
      if (fx > -30 && fx < canvas.width + 30) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(fx - 13, fuelY - 13, 26, 26);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(fx - 13, fuelY - 13, 26, 26);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('⛽', fx - 9, fuelY + 5);
      }

      // الجزيئات
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.045;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color || auraColor;
        ctx.beginPath(); ctx.arc(p.x - camX, p.y, 4 * p.life, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // رسم السيارة بنوابض التعليق + المصابيح + صورة الشخصية
      ctx.save();
      ctx.translate(car.x - camX, car.y);
      ctx.rotate(car.angle);

      // شعاع المصابيح الأمامية
      const lightGrad = ctx.createLinearGradient(24, -4, 130, 8);
      lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.32)');
      lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.moveTo(26, -8); ctx.lineTo(130, -28); ctx.lineTo(130, 20); ctx.lineTo(26, 2);
      ctx.closePath(); ctx.fill();

      // هالة الدرع أو المغناطيس
      if (hasShield || shieldFlash > 0) {
        ctx.strokeStyle = shieldFlash > 0 ? '#facc15' : '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -4, 36, 0, Math.PI * 2); ctx.stroke();
        if (shieldFlash > 0) shieldFlash--;
      } else if (hasMagnet) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -4, 42, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // نوابض التعليق (Suspension Struts)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(-18, 10 - car.rearComp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(18, 10 - car.frontComp); ctx.stroke();

      // هيكل السيارة
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-28, -12, 56, 16);
      ctx.fillStyle = auraColor;
      ctx.fillRect(-28, -4, 56, 4);

      // صورة الشخصية في المقصورة
      if (avatarLoaded) {
        ctx.save();
        ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, -12, -32, 24, 24);
        ctx.restore();
        ctx.strokeStyle = auraColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-10, -24, 22, 12);
      }

      // العجلتان المستقلتان
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-18, 11 - car.rearComp, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(18, 11 - car.frontComp, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();

      // النصوص المتطايرة
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y -= 1.0; p.life -= 0.025;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color || '#f3d576';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(p.text, p.x - camX, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // وميض تحذير انخفاض الوقود
      if (car.fuel < 25 && frame % 24 < 12) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      // شريط HUD علوي
      ctx.fillStyle = 'rgba(11, 17, 32, 0.78)';
      ctx.fillRect(14, 12, 255, 52);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 12, 255, 52);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px sans-serif';
      const badges = `${hasShield ? '🛡️' : ''}${hasMagnet ? '🧲' : ''}`;
      ctx.fillText(`النقاط: ${totalScore}  |  🪙 ${coinsCollected}  ${badges}`, 22, 31);

      const fuelPct = Math.max(0, Math.min(1, car.fuel / maxFuel));
      ctx.fillStyle = car.fuel < 25 ? '#ef4444' : '#22c55e';
      ctx.fillRect(22, 40, fuelPct * 185, 11);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(22, 40, 185, 11);

      // مؤشر المسافة المتبقية للوقود القادم
      const distToFuel = Math.max(0, Math.round((nextFuelX - car.x) / 10));
      if (distToFuel > 0 && distToFuel < 90) {
        ctx.fillStyle = '#f3d576';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`⛽ ${distToFuel}م`, 214, 50);
      }

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
