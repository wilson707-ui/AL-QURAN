// Service Worker - القرآن الكريم
// النسخة v3: مستقر للجوال، يخزّن كل شي تلقائياً

const CACHE = 'quran-v3';

// ===== التثبيت: نخزّن ملفات التطبيق الأساسية فقط =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // نحاول نخزّن كل ملف بشكل مستقل حتى لو فشل واحد ما يوقف الباقي
      const files = ['./index.html', './manifest.json', './sw.js'];
      return Promise.allSettled(
        files.map(f => cache.add(f).catch(() => {}))
      );
    })
  );
  // تفعيل فوري بدون انتظار إغلاق التبويبات القديمة
  self.skipWaiting();
});

// ===== التفعيل: حذف الكاش القديم =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== الاعتراض: Cache First ثم Network =====
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = req.url;

  // تجاهل: طلبات POST، chrome-extension، وغير HTTP
  if (req.method !== 'GET') return;
  if (!url.startsWith('http')) return;

  // تجاهل: API التفسير (نصوص، نحفظها في localStorage مو هنا)
  if (url.includes('alquran.cloud')) return;

  // كل شي تاني: Cache First ثم Network مع تخزين
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      // حاول من الكاش أولاً
      const cached = await cache.match(req, { ignoreSearch: false });
      if (cached) return cached;

      // مو في الكاش، اجلبه من الشبكة
      try {
        const response = await fetch(req);

        // نخزّن فقط الاستجابات الناجحة
        if (response && response.status === 200) {
          // نخزّن: صفحات المصحف، الخطوط، الصوت، ملفات التطبيق
          const shouldCache =
            url.includes('/pages/') ||
            url.includes('fonts-woff2') ||
            url.includes('everyayah.com') ||
            url.includes('mp3quran.net') ||
            url.includes('index.html') ||
            url.includes('manifest.json') ||
            url.endsWith('/');

          if (shouldCache) {
            cache.put(req, response.clone()).catch(() => {});
          }
        }

        return response;
      } catch (err) {
        // لا يوجد نت ولا كاش — نرجع صفحة خطأ مناسبة
        if (url.includes('.mp3')) {
          return new Response('', { status: 503 });
        }
        if (url.includes('.json')) {
          return new Response(
            JSON.stringify({ error: 'offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // للصفحة الرئيسية: نرجع index.html من الكاش مهما صار
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;

        return new Response('التطبيق غير متاح بدون إنترنت', { status: 503 });
      }
    })
  );
});
