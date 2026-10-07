/* Service Worker
   1) يحفظ هيكل التطبيق (index.html) عشان يفتح بدون إنترنت.
   2) يدير تحميل صفحات المصحف والخطوط في الخلفية، بحيث يكمل حتى لو
      المستخدم طلع من التطبيق أو صغّر المتصفح (طالما المتصفح نفسه شغال).
      ملاحظة: لا يوجد ضمان متصفح 100% لإكمال التحميل لو المستخدم قفل
      المتصفح تماماً أو قتل التطبيق من الخلفية بالجوال — هذا سلوك خارج
      عن تحكم أي تطبيق ويب. لكن التحميل يعتمد على استئناف تلقائي: أي
      صفحة/خط محفوظ مسبقاً يُتخطى، فلو انقطع التحميل يكمل من حيث وقف
      بدل ما يبدأ من الصفر.
   3) يدير أيضاً تحميل الصوتيات (تلاوات القراء) في الخلفية بنفس الطريقة،
      بحيث لا يتوقف التحميل لو المستخدم أغلق صفحة الإعدادات أو تصفح
      داخل التطبيق أثناء التحميل.
*/

const SHELL_CACHE = 'quran-shell-v2';
const PAGES_CACHE = 'quran-pages-v1'; // نفس الاسم المستخدم داخل index.html
const OFFLINE_CACHE = 'quran-offline-v1'; // ذاكرة الصوتيات، نفس الاسم المستخدم داخل index.html
const SHELL_FILES = ['./', './index.html', './manifest.json'];

const RAW_BASE = 'https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main';
const FONT_CDN = 'https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main/fonts-woff2';
const TOTAL_PAGES = 604;
const ALL_FONT_NAMES = (() => {
  const n = ['QCF4_QBSML'];
  for (let i = 1; i <= 47; i++) n.push(`QCF4_Hafs_${String(i).padStart(2, '0')}`);
  return n;
})();
const pad3 = n => String(n).padStart(3, '0');
const fontUrl = name => `${FONT_CDN}/${name}${name === 'QCF4_QBSML' ? '' : '_W'}.woff2`;
const pageUrl = n => `${RAW_BASE}/pages/${pad3(n)}.json`;

/* ===== معلومات القرّاء والصوتيات — نفس البيانات المستخدمة داخل index.html ===== */
const AUDIO_BASE = 'https://cdn.islamic.network/quran/audio/128';
const RECITERS = {
  'ar.alafasy':              { ayahByAyah: true },
  'ar.abdulbasitmurattal':   { ayahByAyah: true },
  'ar.hudhaify':             { ayahByAyah: true },
  'ar.tablawy':              { ayahByAyah: true },
  'islam': {
    ayahByAyah: false,
    surahUrl: s => `https://server14.mp3quran.net/islam/Rewayat-Hafs-A-n-Assem/${String(s).padStart(3, '0')}.mp3`
  }
};
const SURAH_AYAT_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const TOTAL_AYAT = 6236;
function globalAyahNumber(s, a) {
  let n = 0;
  for (let i = 0; i < s - 1; i++) n += SURAH_AYAT_COUNTS[i];
  return n + a;
}
function ayahAudioUrl(reciterId, s, a) {
  return `${AUDIO_BASE}/${reciterId}/${globalAyahNumber(s, a)}.mp3`;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_FILES.map(async url => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* الملف قد لا يكون موجوداً، تجاهل */ }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== PAGES_CACHE && k !== OFFLINE_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req.url, { cache: 'no-cache' });
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return cached;
      }
    })());
    return;
  }

  // صفحات المصحف والخطوط (GitHub, jsdelivr): تُقرأ من الذاكرة المحفوظة أولاً، ثم الشبكة
  const isPageOrFont = url.href.startsWith(RAW_BASE) || url.href.startsWith(FONT_CDN);
  if (isPageOrFont) {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 404 });
      }
    })());
    return;
  }

  // باقي الطلبات (الصوتيات تحديداً): تُقرأ من ذاكرة الأوفلاين أولاً إذا كانت محفوظة
  event.respondWith((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('', { status: 404 });
    }
  })());
});

/* ===================== تحميل الصفحات والخطوط في الخلفية ===================== */
let downloading = false;

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}

async function getStatus() {
  const cache = await caches.open(PAGES_CACHE);
  let pagesDone = 0;
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    if (await cache.match(pageUrl(p))) pagesDone++;
  }
  let fontsDone = 0;
  for (const f of ALL_FONT_NAMES) {
    if (await cache.match(fontUrl(f))) fontsDone++;
  }
  return {
    pagesDone, pagesTotal: TOTAL_PAGES,
    fontsDone, fontsTotal: ALL_FONT_NAMES.length,
    complete: pagesDone === TOTAL_PAGES && fontsDone === ALL_FONT_NAMES.length,
    downloading
  };
}

async function downloadAllPages() {
  if (downloading) return;
  downloading = true;
  try {
    const cache = await caches.open(PAGES_CACHE);

    for (const f of ALL_FONT_NAMES) {
      const u = fontUrl(f);
      if (!(await cache.match(u))) {
        try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch (e) {}
      }
    }

    const BATCH = 10;
    let done = 0;
    for (let s = 1; s <= TOTAL_PAGES; s += BATCH) {
      const jobs = [];
      for (let p = s; p < Math.min(s + BATCH, TOTAL_PAGES + 1); p++) {
        jobs.push((async () => {
          const u = pageUrl(p);
          if (!(await cache.match(u))) {
            try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch (e) {}
          }
        })());
      }
      await Promise.all(jobs);
      done += jobs.length;
      broadcast({ type: 'PAGES_DOWNLOAD_PROGRESS', done, total: TOTAL_PAGES });
    }

    const status = await getStatus();
    downloading = false;
    broadcast({ type: 'PAGES_DOWNLOAD_DONE', complete: status.complete });
  } catch (e) {
    downloading = false;
    broadcast({ type: 'PAGES_DOWNLOAD_ERROR' });
  }
}

/* ===================== تحميل صوت القارئ في الخلفية ===================== */
let reciterDownloading = {}; // reciterId -> true/false

async function downloadReciterAudio(reciterId) {
  if (reciterDownloading[reciterId]) return;
  const reciter = RECITERS[reciterId];
  if (!reciter) {
    broadcast({ type: 'RECITER_DOWNLOAD_ERROR', reciterId });
    return;
  }
  reciterDownloading[reciterId] = true;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const total = reciter.ayahByAyah ? TOTAL_AYAT : 114;
    const unit = reciter.ayahByAyah ? 'ayah' : 'surah';
    broadcast({ type: 'RECITER_DOWNLOAD_PROGRESS', reciterId, done: 0, total, unit });

    if (!reciter.ayahByAyah) {
      for (let s = 1; s <= 114; s++) {
        const url = reciter.surahUrl(s);
        if (!(await cache.match(url))) {
          try { const r = await fetch(url, { mode: 'no-cors' }); await cache.put(url, r); } catch (e) {}
        }
        broadcast({ type: 'RECITER_DOWNLOAD_PROGRESS', reciterId, done: s, total: 114, unit: 'surah' });
      }
    } else {
      let done = 0;
      for (let s = 1; s <= 114; s++) {
        const ayatInSurah = SURAH_AYAT_COUNTS[s - 1];
        for (let a = 1; a <= ayatInSurah; a++) {
          const url = ayahAudioUrl(reciterId, s, a);
          if (!(await cache.match(url))) {
            try { const r = await fetch(url, { mode: 'no-cors' }); await cache.put(url, r); } catch (e) {}
          }
          done++;
          if (done % 3 === 0 || done === TOTAL_AYAT) {
            broadcast({ type: 'RECITER_DOWNLOAD_PROGRESS', reciterId, done, total: TOTAL_AYAT, unit: 'ayah' });
          }
        }
      }
    }

    reciterDownloading[reciterId] = false;
    broadcast({ type: 'RECITER_DOWNLOAD_DONE', reciterId });
  } catch (e) {
    reciterDownloading[reciterId] = false;
    broadcast({ type: 'RECITER_DOWNLOAD_ERROR', reciterId });
  }
}

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'START_PAGES_DOWNLOAD') {
    event.waitUntil(downloadAllPages());
  } else if (data.type === 'CHECK_PAGES_STATUS') {
    event.waitUntil((async () => {
      const status = await getStatus();
      const src = event.source;
      if (src) src.postMessage({ type: 'PAGES_STATUS', ...status });
    })());
  } else if (data.type === 'START_RECITER_DOWNLOAD') {
    event.waitUntil(downloadReciterAudio(data.reciterId));
  }
});

// دعم Background Sync كإجراء احتياطي: لو المتصفح يدعمه، يحاول يستأنف
// التحميل تلقائياً أول ما يرجع الاتصال بالإنترنت، حتى لو التطبيق مقفول.
self.addEventListener('sync', event => {
  if (event.tag === 'download-pages') {
    event.waitUntil(downloadAllPages());
  }
});
