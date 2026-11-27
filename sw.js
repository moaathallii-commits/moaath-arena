/**
 * Moaath Arena World - Service Worker (Smart Auto-Update v3.0)
 * المسار في GitHub: sw.js
 * - تخزين مرن (Promise.allSettled) فلا يفشل التثبيت أبداً إذا نقص ملف
 * - يضم أصول مسار الـ 360 يوماً الـ 13 الجديدة تحت assets/tower_match/streak/
 * - استثناء تام لـ workers.dev و firebaseio.com لمنع الغش
 */

const CACHE_NAME = 'moaath-arena-smart-cache-v24';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/characters_engine.js',
  './js/tower_match/tower_assets.js',
  './js/tower_match/tower_board.js',
  './js/tower_match/tower_engine.js',
  './js/tower_match/tower_ui.js',
  './game_tower.png',
  './game_hill.png',
  './game_shooter.png',
  './assets/ui/coin_moaath.png',
  './assets/ui/shamcash.png',
  './assets/shop/shield_1.png',
  './assets/shop/double_xp.png',
  './assets/shop/arena_pass.png',
  './assets/shop/tower_bomb.png',
  './assets/shop/tower_row.png',
  './assets/shop/tower_wildcard.png',
  './assets/tower_match/perks/perk_sword.png',
  './assets/tower_match/perks/perk_clock.png',
  './assets/tower_match/perks/perk_skill.png',
  './assets/pvp_prestige/pvp_def_5.png',
  './assets/pvp_prestige/pvp_def_10.png',
  './assets/pvp_prestige/pvp_def_15.png',
  './assets/pvp_prestige/pvp_def_20.png',
  './assets/pvp_prestige/pvp_def_25.png',
  './assets/pvp_prestige/pvp_def_50.png',
  './assets/pvp_prestige/pvp_str_3.png',
  './assets/pvp_prestige/pvp_str_5.png',
  './assets/pvp_prestige/pvp_str_10.png',
  './assets/pvp_prestige/pvp_str_20.png',
  './assets/tower_match/boss_5_frost.png',
  './assets/tower_match/boss_6_shadow.png',
  './assets/tower_match/boss_7_cyber.png',
  './assets/tower_match/boss_8_phoenix.png',
  './assets/tower_match/boss_9_chrono.png',
  './assets/tower_match/crates/crate_basic.png',
  './assets/tower_match/crates/crate_epic.png',
  './assets/tower_match/crates/crate_legendary.png',
  './assets/tower_match/streak/frame_streak_01_copper.png',
  './assets/tower_match/streak/frame_streak_02_silver.png',
  './assets/tower_match/streak/frame_streak_03_ruby.png',
  './assets/tower_match/streak/frame_streak_04_dragon.png',
  './assets/tower_match/streak/frame_streak_05_phoenix.png',
  './assets/tower_match/streak/frame_streak_06_galaxy.png',
  './assets/tower_match/streak/badge_tower_01_spark.png',
  './assets/tower_match/streak/badge_tower_02_sword.png',
  './assets/tower_match/streak/badge_tower_03_breaker.png',
  './assets/tower_match/streak/badge_tower_04_hype2x.png',
  './assets/tower_match/streak/badge_tower_05_combo_diamond.png',
  './assets/tower_match/streak/badge_tower_06_elite.png',
  './assets/tower_match/streak/badge_tower_07_crown.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.includes('workers.dev') || url.hostname.includes('firebaseio.com')) return;

  const isMedia = /\.(mp3|wav|ogg|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname);
  if (isMedia) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
