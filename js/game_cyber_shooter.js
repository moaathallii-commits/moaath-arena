/**
 * لعبة ميجا شوتر 2D (Mega Man Style Action Shooter)
 * المسار في GitHub: js/game_cyber_shooter.js
 * مصممة للعمل بـ 60 FPS مع مسجل Telemetry لمنع الغش.
 */
window.CyberShooterGame = {
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

    const groundY = canvas.height * 0.78;
    const player = { x: 64, y: groundY - 40, vy: 0, hp: 3, onGround: true };
    const bullets = [];
    const enemies = [];
    let score = 0;
    let kills = 0;
    let shots = 0;
    let frame = 0;
    let rngState = seed || 12345;

    const nextRand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    const btnJump = document.getElementById('btnGameLeft');
    const btnShoot = document.getElementById('btnGameRight');
    btnJump.textContent = '⬆️ قفز';
    btnShoot.textContent = '🔥 إطلاق';

    btnJump.onpointerdown = (e) => {
      e.preventDefault();
      if (player.onGround) {
        player.vy = -12.5;
        player.onGround = false;
      }
    };

    btnShoot.onpointerdown = (e) => {
      e.preventDefault();
      if (bullets.length < 5) {
        bullets.push({ x: player.x + 28, y: player.y + 14, vx: 11 });
        shots++;
      }
    };

    const endGame = (reason) => {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.rafId);
      const durationSec = (Date.now() - startTime) / 1000;
      snapshots.push({ t: Math.round(durationSec), s: score, k: kills });
      onFinish(score, { durationSec, kills, shots, reason, snapshots });
    };

    const loop = () => {
      if (!this.running) return;
      frame++;
      const now = Date.now();

      // فيزياء اللاعب
      player.vy += 0.65;
      player.y += player.vy;
      if (player.y >= groundY - 40) {
        player.y = groundY - 40;
        player.vy = 0;
        player.onGround = true;
      }

      // توليد الأعداء بوتيرة متصاعدة
      const spawnRate = Math.max(35, 85 - Math.floor(kills / 3));
      if (frame % spawnRate === 0) {
        const flying = nextRand() > 0.55;
        enemies.push({
          x: canvas.width + 20,
          y: flying ? groundY - 95 : groundY - 34,
          vx: -(3.2 + Math.min(4.5, kills * 0.08)),
          hp: flying ? 1 : 2
        });
      }

      // تحديث الرصاص
      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].vx;
        if (bullets[i].x > canvas.width) bullets.splice(i, 1);
      }

      // تحديث الأعداء والتصادم
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx;

        // تصادم مع رصاص اللاعب
        for (let b = bullets.length - 1; b >= 0; b--) {
          if (Math.abs(bullets[b].x - en.x) < 22 && Math.abs(bullets[b].y - en.y) < 26) {
            bullets.splice(b, 1);
            en.hp--;
            if (en.hp <= 0) {
              enemies.splice(i, 1);
              kills++;
              score += 20;
            }
            break;
          }
        }
        if (!enemies[i]) continue;

        // تصادم العدو مع اللاعب
        if (Math.abs(en.x - player.x) < 26 && Math.abs(en.y - player.y) < 34) {
          enemies.splice(i, 1);
          player.hp--;
          if (player.hp <= 0) return endGame('defeated');
        } else if (en.x < -30) {
          enemies.splice(i, 1);
        }
      }

      // نقاط البقاء
      if (frame % 60 === 0) score += 2;

      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: score, k: kills });
      }

      // الرسم
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // الأرضية
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(0, groundY, canvas.width, 3);

      // رسم اللاعب
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(player.x, player.y, 28, 40);
      ctx.fillStyle = '#f3d576';
      ctx.fillRect(player.x + 18, player.y + 8, 12, 8);

      // رسم الرصاص
      ctx.fillStyle = '#facc15';
      bullets.forEach((b) => ctx.fillRect(b.x, b.y, 12, 5));

      // رسم الأعداء
      enemies.forEach((en) => {
        ctx.fillStyle = en.hp > 1 ? '#ef4444' : '#f97316';
        ctx.fillRect(en.x - 14, en.y - 14, 28, 28);
      });

      // شريط المعلومات
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`النقاط: ${score}  |  الأعداء: ${kills}`, 16, 30);
      ctx.fillStyle = '#ef4444';
      ctx.fillText('❤️'.repeat(player.hp), 16, 56);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
};
