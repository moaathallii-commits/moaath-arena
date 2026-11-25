/**
 * لعبة ميجا شوتر 2D (Cyber Shooter - Landscape & Character Edition)
 * المسار في GitHub: js/game_cyber_shooter.js
 * - شاشة أفقية مع أزرار لمس شفافة عائمة + إطلاق مستمر عند الضغط المطوّل + قفز مزدوج.
 * - تدعم لون أجنحة الشخصية النشطة، درع الحماية، وأرقام النقاط المتطايرة.
 */
window.CyberShooterGame = {
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

    const charObj = window.ArenaVoice ? window.ArenaVoice.getChar(options.characterId) : { color: '#38bdf8' };
    const auraColor = charObj.color || '#38bdf8';

    const avatarImg = new Image();
    let avatarLoaded = false;
    if (window.ArenaVoice && options.characterId) {
      avatarImg.onload = () => { avatarLoaded = true; };
      avatarImg.src = window.ArenaVoice.getCharImgUrl(options.characterId);
    }

    let hasShield = options.activeItem === 'shield_1';
    const groundY = () => canvas.height * 0.80;
    const player = { x: 84, y: groundY() - 42, vy: 0, hp: 3, jumpsLeft: 2, invuln: 0 };
    const bullets = [];
    const enemies = [];
    const popups = [];
    let score = 0;
    let kills = 0;
    let shots = 0;
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
    btnJump.innerHTML = '⬆️<small>قفز</small>';
    btnShoot.innerHTML = '🔥<small>إطلاق</small>';

    btnJump.onpointerdown = (e) => {
      e.preventDefault();
      btnJump.classList.add('pressed');
      if (player.jumpsLeft > 0) {
        player.vy = -12.2;
        player.jumpsLeft--;
      }
    };
    btnJump.onpointerup = btnJump.onpointerleave = btnJump.onpointercancel = () => btnJump.classList.remove('pressed');

    const setFire = (v) => (e) => { e.preventDefault(); firing = v; btnShoot.classList.toggle('pressed', v); };
    btnShoot.onpointerdown = setFire(true);
    btnShoot.onpointerup = btnShoot.onpointerleave = btnShoot.onpointercancel = setFire(false);

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
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) resize();
      frame++;
      const now = Date.now();
      const gY = groundY();

      // إطلاق نار مستمر عند الضغط المطوّل
      if (firing && frame - lastShotFrame >= 10 && bullets.length < 7) {
        bullets.push({ x: player.x + 30, y: player.y + 16, vx: 12.5 });
        shots++;
        lastShotFrame = frame;
      }

      // فيزياء اللاعب (مع قفز مزدوج)
      player.vy += 0.65;
      player.y += player.vy;
      if (player.y >= gY - 42) {
        player.y = gY - 42;
        player.vy = 0;
        player.jumpsLeft = 2;
      }
      if (player.invuln > 0) player.invuln--;

      // توليد الأعداء
      const spawnRate = Math.max(32, 82 - Math.floor(kills / 3));
      if (frame % spawnRate === 0) {
        const flying = nextRand() > 0.52;
        const maxHp = flying ? 1 : 2;
        enemies.push({
          x: canvas.width + 24,
          y: flying ? gY - 96 : gY - 34,
          vx: -(3.5 + Math.min(4.8, kills * 0.08)),
          hp: maxHp,
          maxHp
        });
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].vx;
        if (bullets[i].x > canvas.width) bullets.splice(i, 1);
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.x += en.vx;

        for (let b = bullets.length - 1; b >= 0; b--) {
          if (Math.abs(bullets[b].x - en.x) < 24 && Math.abs(bullets[b].y - en.y) < 26) {
            bullets.splice(b, 1);
            en.hp--;
            if (en.hp <= 0) {
              enemies.splice(i, 1);
              kills++;
              score += 20;
              popups.push({ x: en.x, y: en.y - 10, text: '+20', life: 1 });
            }
            break;
          }
        }
        if (!enemies[i]) continue;

        if (player.invuln === 0 && Math.abs(en.x - player.x) < 26 && Math.abs(en.y - player.y) < 34) {
          enemies.splice(i, 1);
          if (hasShield) {
            hasShield = false;
            player.invuln = 45;
            popups.push({ x: player.x, y: player.y - 16, text: '🛡️ صدّ!', life: 1.2 });
          } else {
            player.hp--;
            player.invuln = 45;
            if (player.hp <= 0) return endGame('defeated');
          }
        } else if (en.x < -30) {
          enemies.splice(i, 1);
        }
      }

      if (frame % 60 === 0) score += 2;
      if (now - lastSnapTime >= 1000) {
        lastSnapTime = now;
        snapshots.push({ t: Math.round((now - startTime) / 1000), s: score, k: kills });
      }

      // 1. خلفية مدينة مستقبلية متحركة (Parallax)
      ctx.fillStyle = '#070d1d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f1c36';
      const offset = (frame * 0.8) % 90;
      for (let bx = -offset; bx < canvas.width + 90; bx += 90) {
        const bh = 60 + ((Math.floor((bx + offset) / 90) * 37) % 75);
        ctx.fillRect(bx, gY - bh, 58, bh);
      }

      // 2. الأرضية
      ctx.fillStyle = '#15233d';
      ctx.fillRect(0, gY, canvas.width, canvas.height - gY);
      ctx.fillStyle = auraColor;
      ctx.fillRect(0, gY, canvas.width, 3);

      // 3. رسم اللاعب مع الأجنحة والدرع
      ctx.save();
      if (player.invuln > 0 && frame % 6 < 3) ctx.globalAlpha = 0.45;
      if (hasShield) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(player.x + 14, player.y + 20, 30, 0, Math.PI * 2); ctx.stroke();
      }
      // أجنحة الطاقة
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y + 18);
      ctx.lineTo(player.x - 18, player.y + 4);
      ctx.lineTo(player.x - 10, player.y + 28);
      ctx.closePath();
      ctx.fill();

      // الجسم
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(player.x, player.y + 14, 28, 28);
      ctx.fillStyle = auraColor;
      ctx.fillRect(player.x + 20, player.y + 16, 14, 7);

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

      // 4. الرصاص
      ctx.fillStyle = auraColor;
      bullets.forEach((b) => ctx.fillRect(b.x, b.y, 14, 5));

      // 5. الأعداء مع شريط صحة
      enemies.forEach((en) => {
        ctx.fillStyle = en.hp > 1 ? '#ef4444' : '#f97316';
        ctx.fillRect(en.x - 14, en.y - 14, 28, 28);
        if (en.maxHp > 1) {
          ctx.fillStyle = '#000';
          ctx.fillRect(en.x - 14, en.y - 22, 28, 4);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(en.x - 14, en.y - 22, (en.hp / en.maxHp) * 28, 4);
        }
      });

      // 6. أرقام النقاط المتطايرة
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y -= 1.1; p.life -= 0.03;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = '#f3d576';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // 7. شريط HUD
      ctx.fillStyle = 'rgba(11, 17, 32, 0.72)';
      ctx.fillRect(14, 12, 240, 48);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 12, 240, 48);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`النقاط: ${score}  |  الأعداء: ${kills}`, 24, 32);
      ctx.fillText(`${'❤️'.repeat(player.hp)} ${hasShield ? '🛡️' : ''}`, 24, 52);

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
};
