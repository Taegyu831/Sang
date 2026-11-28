// Offline cache. After one visit with internet, the whole app (page, scripts,
// fonts, the face engine, the spare portraits) is kept in the browser, so it
// starts and measures without internet. Only the AI portrait needs internet;
// without it the spare portrait is shown.
//
// VERSION and FILES are written by tools/make-sw.py. Run it before every
// push (python3 tools/make-sw.py --check says whether it is up to date).
const VERSION = "b3b3bc629458";
const FILES = [
  "./",
  "age.js",
  "app-v3.js",
  "avatar.js",
  "calibration.js",
  "camera.js",
  "capture.js",
  "character.js",
  "classic.html",
  "closing.js",
  "collect.js",
  "content.json",
  "debug.js",
  "extras.js",
  "facets.js",
  "fallback/clash-drive+-female.jpg",
  "fallback/clash-drive+-male.jpg",
  "fallback/clash-even-female.jpg",
  "fallback/clash-even-male.jpg",
  "fallback/clash-feel+-female.jpg",
  "fallback/clash-feel+-male.jpg",
  "fallback/clash-feel--female.jpg",
  "fallback/clash-feel--male.jpg",
  "fallback/clash-social+-female.jpg",
  "fallback/clash-social+-male.jpg",
  "fallback/clash-steady+-female.jpg",
  "fallback/clash-steady+-male.jpg",
  "fallback/clash-steady--female.jpg",
  "fallback/clash-steady--male.jpg",
  "fallback/fit-drive+-female.jpg",
  "fallback/fit-drive+-male.jpg",
  "fallback/fit-drive--female.jpg",
  "fallback/fit-drive--male.jpg",
  "fallback/fit-even-female.jpg",
  "fallback/fit-even-male.jpg",
  "fallback/fit-feel+-female.jpg",
  "fallback/fit-feel+-male.jpg",
  "fallback/fit-feel--female.jpg",
  "fallback/fit-feel--male.jpg",
  "fallback/fit-social+-female.jpg",
  "fallback/fit-social+-male.jpg",
  "fallback/fit-social--female.jpg",
  "fallback/fit-social--male.jpg",
  "fallback/fit-steady+-female.jpg",
  "fallback/fit-steady+-male.jpg",
  "fallback/fit-steady--female.jpg",
  "fallback/fit-steady--male.jpg",
  "features.js",
  "fonts/NotoSerifKR-Seal.woff2",
  "fonts/PlexMono-Medium.woff2",
  "fonts/PlexMono-Regular.woff2",
  "fonts/PlexSansKR-Bold.woff2",
  "fonts/PlexSansKR-Medium.woff2",
  "fonts/PlexSansKR-Regular.woff2",
  "frames.js",
  "hair.js",
  "index.html",
  "interpret.js",
  "lab/depth-analysis.js",
  "lab/depth-lab.html",
  "lab/design/app.js",
  "lab/design/index.html",
  "lab/design/style.css",
  "lab/desk/app.js",
  "lab/desk/base.css",
  "lab/desk/chat.css",
  "lab/desk/chat.js",
  "lab/desk/engine.js",
  "lab/desk/index.html",
  "lab/desk/music.css",
  "lab/desk/music.js",
  "lab/desk/video.css",
  "lab/desk/video.js",
  "lab/scroll/app.js",
  "lab/scroll/index.html",
  "lab/scroll/looks.js",
  "lab/scroll/motion.js",
  "lab/scroll/parts.js",
  "lab/scroll/style.css",
  "lab/talk/index.html",
  "map.js",
  "master.js",
  "ohaeng.js",
  "pairs.js",
  "parts.js",
  "parts.json",
  "portrait.js",
  "pose.js",
  "reading.js",
  "residual.js",
  "sanjeong.js",
  "story.js",
  "styles.css",
  "summary.js",
  "talk/app.js",
  "talk/capture-room.js",
  "talk/character.js",
  "talk/couple.js",
  "talk/kit.js",
  "talk/spoken.js",
  "talk/style.css",
  "vendor/mediapipe/face_landmarker.task",
  "vendor/mediapipe/hair_segmenter.tflite",
  "vendor/mediapipe/vision_bundle.mjs",
  "vendor/mediapipe/wasm/vision_wasm_internal.js",
  "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
];

const CACHE = `sang-${VERSION}`;
// Big and rarely changing: served from the cache first.
const STATIC = /\/(vendor|fonts|fallback)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // one by one, so a single failed file does not stop the others
      await Promise.all(FILES.map((file) => cache.add(new Request(file, { cache: "reload" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("sang-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return; // the portrait API is not touched
  event.respondWith(answer(request, url));
});

async function answer(request, url) {
  const cache = await caches.open(CACHE);
  // the same file whatever the ?query (?debug=1 and so on)
  const key = new Request(url.origin + url.pathname);
  const cached = await cache.match(key, { ignoreSearch: true });
  if (STATIC.test(url.pathname) && cached) return cached;
  // Page and scripts: the newest copy when online (3 s at most), else the saved one.
  try {
    const fresh = await withTimeout(fetch(request), cached ? 3000 : 20000);
    if (fresh.ok) cache.put(key, fresh.clone());
    return fresh;
  } catch {
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
