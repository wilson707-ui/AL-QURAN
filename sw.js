// Service Worker لتطبيق القرآن الكريم
// يخزّن كل صفحة وخط يُطلب فعلياً، بحيث تصبح متاحة بدون إنترنت بعد أول فتح

const CACHE_NAME = "quran-mushaf-v1";

// عند التثبيت، نخزّن الملفات الأساسية للتطبيق نفسه (الواجهة)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(["./", "./index.html", "./manifest.json"]);
      })
      .catch(() => {
        // تجاهل أي خطأ بسيط هنا، الأهم هو التخزين أثناء التصفح
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// استراتيجية "Cache First, then Network":
// إذا الملف محفوظ سابقاً، نعطيه فوراً من المخزن (يعمل بدون نت)
// إذا غير محفوظ، نجلبه من الإنترنت ونخزنه لاستخدام القادم
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // نخزّن فقط: بيانات الصفحات (pages/*.json) وملفات الخطوط (fonts-woff2/*.woff2)
  // وكذلك ملفات التطبيق نفسه
  const isPageData = url.includes("/pages/") && url.endsWith(".json");
  const isFontFile = url.includes("fonts-woff2") && url.endsWith(".woff2");
  const isAppFile =
    url.includes("index.html") ||
    url.includes("manifest.json") ||
    url.endsWith("/");

  if (!isPageData && !isFontFile && !isAppFile) {
    return; // نترك أي طلب آخر يمر بشكل طبيعي
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // موجود محفوظ، نعطيه فوراً
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // نحفظ نسخة من الاستجابة للاستخدام القادم بدون نت
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // لا يوجد نت ولا نسخة محفوظة لهذا الملف
          return new Response(
            JSON.stringify({
              error: "لا يوجد اتصال بالإنترنت ولم تُحفظ هذه الصفحة مسبقاً",
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        });
    })
  );
});
