/**
 * لعبة قيادة التلال 2D (Hill Drive - Landscape & Character Edition)
 * المسار في GitHub: js/game_hill_drive.js
 * - مصممة للشاشة الأفقية مع أزرار لمس شفافة عائمة.
 * - تدعم صورة الشخصية النشطة داخل المقصورة، هالة الأجنحة، درع الحماية، وخزان الوقود الإضافي.
 */
window.HillDriveGame = {
  running: false,
  rafId: null,

  start(canvas, seed, onFinish, options = {}) {
    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    };
    resize();

    this.running = true;
    const startTime = Date.now();
    let lastSnapTime = startTime;
    const snapshots = [];

    const charObj = window.ArenaVoice ? window.ArenaVoice.getChar(options.characterId) : { color: '#d4af37' };
    const auraColor = charObj.color || '#d4af37';
    const targetRecord = Number(options.recordScore || 0);

    // تحميل صورة الشخصية للمقصورة
    const avatarImg = new Image();
    let avatarLoaded = false;
    if (window.ArenaVoice && options.characterId) {
      avatarImg.onload = () => { avatarLoaded = true; };
      avatarImg.src = window.ArenaVoice.getCharImgUrl(options.characterId);
    }

    // تفعيل الأدوات التكتيكية
    let hasShield = options.activeItem === 'shield_1';
    const maxFuel = options.activeItem === 'fuel_boost' ? 125 : 100;

    // مولد تضاريس حتمي (Seed)
    const terrainHeight = (x) => {
      const s = (seed % 100) * 0.1;
      const base = canvas.height * 0.72;
      return base +
        Math.sin(x * 0.0075 + s) * 44 +
        Math.sin(x * 0.019 + s * 2) * 18;
    };

    const car = { x: 100, y: 100, vx: 0, vy: 0, angle: 0, fuel: maxFuel, onGround: false };
    const controls = { gas: false, brake: false };
    const particles = [];
    let score = 0;
    let nextFuelX = 680;
    let shieldFlash = 0;

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
      const durationSec = (Date.now() - startTime) / 1000;
      snapshots.push({ t: Math.round(durationSec), s: score, f: Math.round(car.fuel) });
      onFinish(score, { durationSec, reason, snapshots });
    };

    const loop = () => {
      if (!this.running) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();
      const now = Date.now();

      // فيزياء السيارة
      if (controls.gas && car.fuel > 0) {
        car.vx += 0.28;
        car.fuel -= 0.11;
        if (Math.random() > 0.35) {
          particles.push({ x: car.x - 24, y: car.y + 4, vx: -2 - Math.random() * 2, vy: -0.5 - Math.random(), life: 1 });
        }
      } else if (controls.brake) {
        car.vx -= 0.22;
      }
      car.vx *= 0.975;
      car.vx = Math.max(-4, Math.min(11, car.vx));
      car.x += car.vx;

      const groundY = terrainHeight(car.x);
      const groundNextY = terrainHeight(car.x + 25);
      const slopeAngle = Math.atan2(groundNextY - groundY, 25);

      car.vy += 0.45;
      car.y += car.vy;

      if (car.y >= groundY - 18) {
        car.y = groundY - 18;
        car.vy = 0;
        car.angle = slopeAngle;
        car.onGround = true;
      } else {
        car.onGround = false;
        if (controls.gas) car.angle -= 0.04;
        if (controls.brake) car.angle += 0.04;
      }

      // التقاط الوقود
      if (Math.abs(car.x - nextFuelX) < 38) {
        car.fuel = Math.min(maxFuel, car.fuel + 45);
        nextFuelX += 680 + (seed % 150);
      }
      if (car.x > nextFuelX + 140) nextFuelX = car.x + 620;

      const distScore = Math.max(0, Math.floor((car.x - 100) / 10));
      if (distScore > score) score = distScore;
      car.fuel -= 0.03;

      // فحص الانقلاب مع دعم درع الحماية
      if (Math.abs(car.angle) > 1.75 && car.onGround) {
        if (hasShield) {
          hasShield = false;
          shieldFlash = 25;
          car.angle = slopeAngle;
          car.vy = -6;
        } else {
          return endGame('flipped');
        }
      }
      if (car.fuel <= 0 && Math.abs(car.vx) < 0.2) return endGame('out_of_fuel');

      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: score, f: Math.round(car.fuel) });
      }

      // 1. خلفية متغيرة حسب المسافة
      const zone = Math.floor(score / 250) % 3;
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

      // 2. رسم التضاريس
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

      // 3. راية الرقم القياسي على الطريق
      if (targetRecord > 0) {
        const recX = 100 + targetRecord * 10 - camX;
        if (recX > -40 && recX < canvas.width + 40) {
          const recY = terrainHeight(100 + targetRecord * 10);
          ctx.strokeStyle = '#f3d576';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(recX, recY); ctx.lineTo(recX, recY - 52); ctx.stroke();
          ctx.fillStyle = '#f3d576';
          ctx.fillRect(recX, recY - 52, 46, 18);
          ctx.fillStyle = '#060b16';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('👑 رقم', recX + 6, recY - 39);
        }
      }

      // 4. رسم علبة الوقود
      const fx = nextFuelX - camX;
      const fy = terrainHeight(nextFuelX) - 24;
      if (fx > -30 && fx < canvas.width + 30) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(fx - 13, fy - 13, 26, 26);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(fx - 13, fy - 13, 26, 26);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('⛽', fx - 9, fy + 5);
      }

      // 5. جزيئات العادم بلون أجنحة الشخصية
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.05;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = auraColor;
        ctx.beginPath(); ctx.arc(p.x - camX, p.y, 4 * p.life, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 6. رسم السيارة + صورة الشخصية
      ctx.save();
      ctx.translate(car.x - camX, car.y);
      ctx.rotate(car.angle);

      // هالة الدرع إذا كان مفعّلاً
      if (hasShield || shieldFlash > 0) {
        ctx.strokeStyle = shieldFlash > 0 ? '#facc15' : '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -4, 34, 0, Math.PI * 2); ctx.stroke();
        if (shieldFlash > 0) shieldFlash--;
      }

      // جسم السيارة
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-26, -12, 52, 16);
      ctx.fillStyle = auraColor;
      ctx.fillRect(-26, -4, 52, 4);

      // صورة الشخصية داخل المقصورة
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

      // العجلات
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-16, 7, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(16, 7, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();

      // 7. شريط HUD علوي أنيق
      ctx.fillStyle = 'rgba(11, 17, 32, 0.72)';
      ctx.fillRect(14, 12, 230, 48);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 12, 230, 48);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`المسافة: ${score} م ${hasShield ? '🛡️' : ''}`, 24, 32);

      const fuelPct = Math.max(0, Math.min(1, car.fuel / maxFuel));
      ctx.fillStyle = car.fuel < 25 ? '#ef4444' : '#22c55e';
      ctx.fillRect(24, 40, fuelPct * 180, 10);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(24, 40, 180, 10);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
};
