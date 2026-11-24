/**
 * لعبة قيادة التلال 2D (Hill Climb Style)
 * المسار في GitHub: js/game_hill_drive.js
 * مصممة للعمل بـ 60 FPS على الهواتف الاقتصادية مع مسجل Telemetry لمنع الغش.
 */
window.HillDriveGame = {
  running: false,
  rafId: null,

  start(canvas, seed, onFinish) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    this.running = true;
    const startTime = Date.now();
    let lastSnapTime = startTime;
    const snapshots = [];

    // مولد تضاريس حتمي يعتمد على seed لضمان عدالة PvP
    const terrainHeight = (x) => {
      const s = (seed % 100) * 0.1;
      return canvas.height * 0.68 +
        Math.sin(x * 0.008 + s) * 42 +
        Math.sin(x * 0.021 + s * 2) * 18;
    };

    const car = { x: 100, y: 100, vx: 0, vy: 0, angle: 0, fuel: 100, onGround: false };
    const controls = { gas: false, brake: false };
    let score = 0;
    let nextFuelX = 650;

    // أزرار اللمس
    const btnGas = document.getElementById('btnGameRight');
    const btnBrake = document.getElementById('btnGameLeft');
    btnGas.textContent = '⛽ بنزين';
    btnBrake.textContent = '🛑 فرامل';

    const setGas = (v) => (e) => { e.preventDefault(); controls.gas = v; };
    const setBrake = (v) => (e) => { e.preventDefault(); controls.brake = v; };

    btnGas.onpointerdown = setGas(true);
    btnGas.onpointerup = btnGas.onpointerleave = setGas(false);
    btnBrake.onpointerdown = setBrake(true);
    btnBrake.onpointerup = btnBrake.onpointerleave = setBrake(false);

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
      const now = Date.now();

      // فيزياء السيارة
      if (controls.gas && car.fuel > 0) {
        car.vx += 0.28;
        car.fuel -= 0.11;
      } else if (controls.brake) {
        car.vx -= 0.22;
      }
      car.vx *= 0.975;
      car.vx = Math.max(-4, Math.min(11, car.vx));
      car.x += car.vx;

      const groundY = terrainHeight(car.x);
      const groundNextY = terrainHeight(car.x + 25);
      const slopeAngle = Math.atan2(groundNextY - groundY, 25);

      car.vy += 0.45; // جاذبية
      car.y += car.vy;

      if (car.y >= groundY - 16) {
        car.y = groundY - 16;
        car.vy = 0;
        car.angle = slopeAngle;
        car.onGround = true;
      } else {
        car.onGround = false;
        if (controls.gas) car.angle -= 0.04;
        if (controls.brake) car.angle += 0.04;
      }

      // التقاط الوقود
      if (Math.abs(car.x - nextFuelX) < 35) {
        car.fuel = Math.min(100, car.fuel + 45);
        nextFuelX += 650 + (seed % 150);
      }
      if (car.x > nextFuelX + 120) {
        nextFuelX = car.x + 600;
      }

      // حساب النقاط (المسافة بالأمتار)
      const distScore = Math.max(0, Math.floor((car.x - 100) / 10));
      if (distScore > score) score = distScore;

      // استهلاك وقود أساسي
      car.fuel -= 0.03;

      // شروط نهاية الجولة (انقلاب أو نفاد وقود)
      if (Math.abs(car.angle) > 1.75 && car.onGround) return endGame('flipped');
      if (car.fuel <= 0 && Math.abs(car.vx) < 0.2) return endGame('out_of_fuel');

      // تسجيل لقطة Telemetry كل ثانية
      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: score, f: Math.round(car.fuel) });
      }

      // الرسم (Canvas 2D)
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const camX = car.x - canvas.width * 0.28;

      // رسم التضاريس
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let sx = 0; sx <= canvas.width; sx += 12) {
        ctx.lineTo(sx, terrainHeight(sx + camX));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fillStyle = '#1e3a8a';
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();

      // رسم علبة الوقود
      const fx = nextFuelX - camX;
      const fy = terrainHeight(nextFuelX) - 24;
      if (fx > -30 && fx < canvas.width + 30) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(fx - 12, fy - 12, 24, 24);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('F', fx - 5, fy + 5);
      }

      // رسم السيارة
      ctx.save();
      ctx.translate(car.x - camX, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(-24, -14, 48, 16);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-10, -24, 22, 11);
      // العجلات
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-15, 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(15, 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // شريط المعلومات (HUD)
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`المسافة: ${score} م`, 16, 30);
      ctx.fillStyle = car.fuel < 25 ? '#ef4444' : '#22c55e';
      ctx.fillRect(16, 42, Math.max(0, car.fuel * 1.4), 10);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(16, 42, 140, 10);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
};
