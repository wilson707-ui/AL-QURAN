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

const SHELL_CACHE = 'quran-shell-v3';
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

/* ===================== أدوات تحميل قوية =====================
   - مهلة لكل طلب + إعادة محاولة تلقائية مع انتظار متزايد
   - انتظار رجوع الإنترنت بدل ما يفشل التحميل
   - لو السيرفر قال "كثرت الطلبات" (429) نوقف كل التحميل شوي
   - عدة جولات: الملفات اللي فشلت تنعاد قبل ما نقول "اكتمل"
*/
const sleep = ms => new Promise(r => setTimeout(r, ms));
let penaltyUntil = 0;

async function waitForOnline(maxMs) {
  const start = Date.now();
  while (typeof navigator !== 'undefined' && navigator.onLine === false && Date.now() - start < maxMs) {
    await sleep(1000);
  }
}

async function robustFetch(url, opts) {
  opts = opts || {};
  const tries = opts.tries || 5;
  const timeoutMs = opts.timeoutMs || 20000;
  const init = opts.init || {};
  let lastErr;
  for (let t = 0; t < tries; t++) {
    if (penaltyUntil > Date.now()) await sleep(penaltyUntil - Date.now());
    await waitForOnline(120000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
      clearTimeout(timer);
      if (r.type === 'opaque' || r.ok) return r;
      if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 425 && r.status !== 429) {
        const e = new Error('http ' + r.status); e.permanent = true; throw e;
      }
      let wait = Math.min(1000 * Math.pow(2, t), 15000);
      const ra = Number(r.headers && r.headers.get('retry-after'));
      if (ra > 0) wait = Math.max(wait, Math.min(ra * 1000, 30000));
      if (r.status === 429) penaltyUntil = Math.max(penaltyUntil, Date.now() + wait);
      lastErr = new Error('http ' + r.status);
      if (t < tries - 1) await sleep(wait + Math.random() * 500);
    } catch (e) {
      clearTimeout(timer);
      if (e && e.permanent) throw e;
      lastErr = e;
      if (t < tries - 1) await sleep(Math.min(1000 * Math.pow(2, t), 15000) + Math.random() * 500);
    }
  }
  throw lastErr || new Error('failed');
}

async function runPool(items, worker, concurrency) {
  const queue = items.slice();
  const failed = [];
  const run = async () => {
    while (queue.length) {
      const it = queue.shift();
      let ok = false;
      try { ok = await worker(it); } catch (e) { ok = false; }
      if (!ok) failed.push(it);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return failed;
}

async function runWithPasses(items, worker, concurrency, passes) {
  let pending = items;
  for (let p = 0; p < passes && pending.length; p++) {
    pending = await runPool(pending, worker, Math.max(1, concurrency - p));
    if (pending.length && p < passes - 1) await sleep(3000 * (p + 1));
  }
  return pending; // اللي ما انحمل بعد كل الجولات
}

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

// يحاول أولاً الملف المدمج داخل التطبيق (بدون إنترنت)، وإذا ما كان موجود يحمّله من النت
async function storeLocalOrRemote(cache, remoteUrl, localPath, kind) {
  try {
    const lr = await fetch(new URL(localPath, self.location.href).href);
    if (lr.ok) {
      const buf = await lr.arrayBuffer();
      let valid = false;
      if (kind === 'font') {
        const b = new Uint8Array(buf.slice(0, 4));
        valid = buf.byteLength > 1000 && b[0] === 0x77 && b[1] === 0x4F && b[2] === 0x46 && b[3] === 0x32;
      } else {
        try { JSON.parse(new TextDecoder().decode(buf)); valid = true; } catch (e) { valid = false; }
      }
      if (valid) {
        await cache.put(remoteUrl, new Response(buf, {
          status: 200,
          headers: { 'Content-Type': kind === 'font' ? 'font/woff2' : 'application/json' }
        }));
        return true;
      }
    }
  } catch (e) { /* ننتقل للتحميل من الإنترنت */ }
  try {
    const r = await robustFetch(remoteUrl);
    await cache.put(remoteUrl, r);
    return true;
  } catch (e) { return false; }
}

async function downloadAllPages() {
  if (downloading) return;
  downloading = true;
  try {
    const cache = await caches.open(PAGES_CACHE);
    let done = 0;
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      if (await cache.match(pageUrl(p))) done++;
    }
    broadcast({ type: 'PAGES_DOWNLOAD_PROGRESS', done, total: TOTAL_PAGES });

    const items = [];
    ALL_FONT_NAMES.forEach(f => items.push({ kind: 'font', name: f }));
    for (let p = 1; p <= TOTAL_PAGES; p++) items.push({ kind: 'page', n: p });

    const worker = async (it) => {
      if (it.kind === 'font') {
        const u = fontUrl(it.name);
        if (await cache.match(u)) return true;
        const suffix = it.name === 'QCF4_QBSML' ? '' : '_W';
        return storeLocalOrRemote(cache, u, `./quran-data/fonts/${it.name}${suffix}.woff2`, 'font');
      }
      const u = pageUrl(it.n);
      if (await cache.match(u)) return true;
      const ok = await storeLocalOrRemote(cache, u, `./quran-data/pages/${pad3(it.n)}.json`, 'page');
      if (ok) {
        done++;
        if (done % 10 === 0 || done === TOTAL_PAGES) {
          broadcast({ type: 'PAGES_DOWNLOAD_PROGRESS', done, total: TOTAL_PAGES });
        }
      }
      return ok;
    };

    await runWithPasses(items, worker, 4, 3);

    const status = await getStatus();
    downloading = false;
    broadcast({
      type: 'PAGES_DOWNLOAD_DONE',
      complete: status.complete,
      missing: (status.pagesTotal - status.pagesDone) + (status.fontsTotal - status.fontsDone)
    });
  } catch (e) {
    downloading = false;
    broadcast({ type: 'PAGES_DOWNLOAD_ERROR' });
  }
}

/* ===================== تحميل صوت القارئ في الخلفية ===================== */
let reciterDownloading = {}; // reciterId -> true/false
const hostCors = {};         // أي سيرفر يسمح بالتحقق من الملفات (CORS)

// نحاول بوضع cors حتى نتأكد إن الملف صوت سليم (مو صفحة خطأ). لو السيرفر ما يسمح، نرجع للوضع القديم.
async function fetchAudio(url) {
  const host = new URL(url).host;
  const ok = r => {
    const ct = (r.headers && r.headers.get('content-type')) || '';
    if (ct && !/audio|octet-stream|mpeg|mp3/i.test(ct)) throw new Error('not audio');
    return r;
  };
  if (hostCors[host] === undefined) {
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (r.ok) { hostCors[host] = true; return ok(r); }
      const e = new Error('http ' + r.status);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) e.permanent = true;
      throw e;
    } catch (e) {
      if (e && e.permanent) throw e;
      if (e instanceof TypeError) {
        const r2 = await fetch(url, { mode: 'no-cors' }); // لو فشل هنا يعني الشبكة نفسها طايحة
        hostCors[host] = false;
        return r2;
      }
      throw e;
    }
  }
  if (hostCors[host] === true) return ok(await robustFetch(url, { init: { mode: 'cors' } }));
  return robustFetch(url, { init: { mode: 'no-cors' } });
}

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
    const urls = [];
    if (reciter.ayahByAyah) {
      for (let s = 1; s <= 114; s++) {
        for (let a = 1; a <= SURAH_AYAT_COUNTS[s - 1]; a++) urls.push(ayahAudioUrl(reciterId, s, a));
      }
    } else {
      for (let s = 1; s <= 114; s++) urls.push(reciter.surahUrl(s));
    }
    const total = urls.length;
    const unit = reciter.ayahByAyah ? 'ayah' : 'surah';

    let done = 0;
    const pending = [];
    for (const u of urls) {
      if (await cache.match(u)) done++; else pending.push(u);
    }
    broadcast({ type: 'RECITER_DOWNLOAD_PROGRESS', reciterId, done, total, unit });

    const step = reciter.ayahByAyah ? 10 : 1;
    const worker = async (url) => {
      try {
        const r = await fetchAudio(url);
        await cache.put(url, r);
      } catch (e) { return false; }
      done++;
      if (done % step === 0 || done === total) {
        broadcast({ type: 'RECITER_DOWNLOAD_PROGRESS', reciterId, done, total, unit });
      }
      return true;
    };

    const left = await runWithPasses(pending, worker, reciter.ayahByAyah ? 3 : 2, 4);

    // تحقق حقيقي: نعدّ اللي انحفظ فعلاً بالذاكرة
    let present = 0;
    for (const u of urls) { if (await cache.match(u)) present++; }
    reciterDownloading[reciterId] = false;
    if (present === total) {
      broadcast({ type: 'RECITER_DOWNLOAD_DONE', reciterId });
    } else {
      broadcast({ type: 'RECITER_DOWNLOAD_ERROR', reciterId, missing: total - present, done: present, total, unit });
    }
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
