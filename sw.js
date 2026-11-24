const CACHE_NAME = 'moaath-arena-core-v1.0.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// تثبيت النواة الأساسية فقط للتحميل السريع على شبكات 3G
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// تنظيف الكاش القديم عند تفعيل نسخة جديدة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// استراتيجية: الكاش أولاً للملفات الثابتة، والشبكة دائماً لطلبات الـ Worker
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // لا تخزن طلبات الخادم الطرفي أو Firebase أبداً (لضمان منع الغش)
  if (url.hostname.includes('workers.dev') || url.hostname.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// استقبال أمر التحديث الآمن بين الجولات فقط
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
