/* ============================================================
 * nsos - sw.js (PWA 离线缓存 + OTA 缓存替换)
 * 策略：
 *   - 首次访问：install 时全量预缓存站点全部静态资源（PRECACHE）。
 *   - 之后访问：cache-first，只读缓存，不请求网络（离线可用）。
 *   - OTA 更新/降级：由页面 JS（js/boot/ota-local.js）把 OTA 包
 *     解压后整体替换本缓存内容（删旧写新），本 SW 逻辑无需变化。
 *   - 未命中缓存时兜底走网络并回写缓存；离线且未命中回退首页。
 *   - sw.js 自身永不缓存，交给浏览器常规更新机制。
 * ============================================================ */
'use strict';

const CACHE = 'nsos-cache';

/* 站点全部静态资源清单（不含 ota/*.zip、不含 sw.js 自身） */
const PRECACHE = [
  'index.html',
  'README.md',
  'assets/android_robot.svg',
  'assets/android_robot_v2.svg',
  'assets/android_robot_v3.svg',
  'assets/android_robot_v4.svg',
  'css/base.css',
  'css/boot.css',
  'css/desktop.css',
  'css/layers.css',
  'css/system-fix.css',
  'css/terminal.css',
  'css/tokens.css',
  'js/boot/boot.js',
  'js/boot/input.js',
  'js/boot/locked.js',
  'js/boot/modes.js',
  'js/boot/ota-local.js',
  'js/core/core.js',
  'js/core/device.js',
  'js/core/event-bus.js',
  'js/core/shell.js',
  'js/core/state-machine.js',
  'js/core/storage.js',
  'js/desktop/control-center.js',
  'js/desktop/gestures.js',
  'js/desktop/launcher.js',
  'js/desktop/notifications.js',
  'js/desktop/statusbar.js',
  'js/main.js',
  'js/ui/os-badge.js',
  'js/ui/os-button.js',
  'js/ui/os-icon.js',
  'js/ui/os-list-item.js',
  'js/ui/os-settings.js',
  'js/ui/os-slider.js',
  'js/ui/os-switch.js',
  'js/ui/os-terminal.js',
  'js/ui/os-toast.js'
];

/* 忽略查询串（?v= 缓存版本号）后的缓存 key：缓存内统一存无查询串的 URL */
function cacheKey(req) {
  const u = new URL(req.url);
  u.hash = '';
  u.search = '';
  return u.href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => './' + p)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 仅同源
  if (url.pathname.endsWith('/sw.js')) return;   // SW 自身走网络
  if (/\/ota\/[^/]+\.zip$/i.test(url.pathname)) return; // OTA 包不缓存，走网络

  event.respondWith((async () => {
    const key = cacheKey(req);
    const cache = await caches.open(CACHE);

    // 1) 缓存命中：直接返回（只读缓存，不请求网络）
    const hit = await cache.match(key);
    if (hit) return hit;

    // 2) 未命中：走网络，成功后回写缓存
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) cache.put(key, resp.clone());
      return resp;
    } catch (err) {
      // 3) 离线兜底：回退缓存首页
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
