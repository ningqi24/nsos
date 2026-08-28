/* ============================================================
 * nsos - ota-local (本地缓存引擎 / OTA 更新·降级)
 * 能力：
 *   - 注册 Service Worker（sw.js）：首次全量预缓存，之后 cache-first 只读缓存
 *   - 解析 OTA zip 包（内置 zip 解析，支持 store / deflate，无需第三方库）
 *   - 应用 OTA 包：整体替换本地缓存文件（升级 / 降级均可）
 *   - 数据源：线上 OTA 源下载，或用户本地导入 .zip 文件
 * 依赖浏览器：Service Worker + Cache API + DecompressionStream('deflate-raw')
 *   （Chrome 80+ / Edge / Firefox 113+ / Safari 16.4+；须 https 或 localhost）
 * ============================================================ */
(function () {
  'use strict';

  const OS = window.OS || (window.OS = {});
  const CACHE = 'nsos-cache';
  const VER_KEY = 'nsos.cacheVersion';

  /* ---------- 工具 ---------- */
  function readU16(dv, off) { return dv.getUint16(off, true); }
  function readU32(dv, off) { return dv.getUint32(off, true); }

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  };
  function mimeOf(name) {
    const i = name.lastIndexOf('.');
    const ext = i >= 0 ? name.slice(i).toLowerCase() : '';
    return MIME[ext] || 'application/octet-stream';
  }

  /* 解析 OTA 包文件名中的版本号：nsos-ota-bX.Y.Z.zip（兼容旧 v 前缀） */
  function verFromName(name) {
    const m = /nsos-ota-[vb]?(\d+)\.(\d+)\.(\d+)\.zip/i.exec(name || '');
    if (!m) return null;
    return 'b' + m[1] + '.' + m[2] + '.' + m[3];
  }
  function parseVer(v) {
    const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(v || '');
    return m ? { major: +m[1], minor: +m[2], build: +m[3] } : null;
  }
  function cmpVer(a, b) {
    a = parseVer(a); b = parseVer(b);
    if (!a || !b) return 0;
    return a.major - b.major || a.minor - b.minor || a.build - b.build;
  }

  /* deflate 解压（zip method 8 = deflate；raw 流） */
  async function inflateRaw(buf) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer();
  }

  /* ---------- ZIP 解析（支持 store=0 / deflate=8） ---------- */
  function findEOCD(dv) {
    const len = dv.byteLength;
    const start = Math.max(0, len - 22 - 65535);
    for (let i = len - 22; i >= start; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }
  function parseZip(ab) {
    const dv = new DataView(ab);
    const eocd = findEOCD(dv);
    if (eocd < 0) throw new Error('无效的 zip 包（未找到目录）');
    const total = readU16(dv, eocd + 10);
    const cdOff = readU32(dv, eocd + 16);

    const entries = [];
    let p = cdOff;
    for (let i = 0; i < total; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = readU16(dv, p + 10);
      const csize = readU32(dv, p + 20);
      const usize = readU32(dv, p + 24);
      const nameLen = readU16(dv, p + 28);
      const extraLen = readU16(dv, p + 30);
      const commentLen = readU16(dv, p + 32);
      const localOff = readU32(dv, p + 42);
      const nameBytes = new Uint8Array(ab, p + 46, nameLen);
      const name = new TextDecoder('utf-8').decode(nameBytes);
      entries.push({ name, method, csize, usize, localOff });
      p += 46 + nameLen + extraLen + commentLen;
    }

    const out = [];
    for (const e of entries) {
      if (e.name.endsWith('/')) continue;              // 目录
      if (e.method !== 0 && e.method !== 8) continue;  // 不支持的方法跳过
      // 本地头：sig + 26 字节 + nameLen(2) + extraLen(2)
      const lh = e.localOff;
      if (dv.getUint32(lh, true) !== 0x04034b50) continue;
      const lNameLen = readU16(dv, lh + 26);
      const lExtraLen = readU16(dv, lh + 28);
      const dataStart = lh + 30 + lNameLen + lExtraLen;
      const data = ab.slice(dataStart, dataStart + e.csize);
      out.push({ name: e.name, method: e.method, data, size: e.usize });
    }
    return out;
  }

  /* 路径规范化：剥 nsos/ 前缀、拒绝穿越、返回站点相对路径；返回 null 表示跳过 */
  function normalizePath(raw) {
    let p = raw.replace(/\\/g, '/');
    if (p.startsWith('nsos/')) p = p.slice(5);
    if (p === 'nsos') return null;
    // 拒绝 ../ 穿越与绝对路径
    if (p.startsWith('/') || p.split('/').indexOf('..') >= 0) return null;
    // 跳过 OTA 嵌入包（避免把历史 zip 再缓存）
    if (p.startsWith('ota/') && /\.zip$/i.test(p)) return null;
    if (!p) return null;
    return p;
  }

  /* ---------- 主流程 ---------- */
  async function unzip(ab) {
    const entries = parseZip(ab);
    const files = [];
    for (const e of entries) {
      const path = normalizePath(e.name);
      if (!path) continue;
      let buf = e.data;
      if (e.method === 8) {
        buf = await inflateRaw(e.data);
        if (buf.byteLength !== e.size && e.size > 0 && Math.abs(buf.byteLength - e.size) > 8) {
          continue; // 解压尺寸异常，跳过损坏条目
        }
      }
      files.push({ path, blob: new Blob([buf]) });
    }
    return files;
  }

  /* 应用 OTA：整体替换缓存。返回 { applied, ver, fileCount } */
  async function apply(ab, verLabel) {
    if (!('caches' in self)) throw new Error('当前环境不支持 Cache API');
    const files = await unzip(ab);
    if (!files.length) throw new Error('OTA 包内没有可应用的文件');
    const ver = verLabel || verFromName(verLabel) || 'unknown';

    const cache = await caches.open(CACHE);
    // 整体替换：先清空再写入
    const keys = await cache.keys();
    await Promise.all(keys.map((k) => cache.delete(k)));
    await Promise.all(files.map((f) => {
      const key = new URL(f.path, self.location.href).href;
      return cache.put(key, new Response(f.blob, { headers: { 'Content-Type': mimeOf(f.path) } }));
    }));

    localStorage.setItem(VER_KEY, ver);
    return { applied: true, ver, fileCount: files.length };
  }

  /* 从线上 OTA 源下载并应用（url 指向 .zip） */
  async function applyFromUrl(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('下载失败 HTTP ' + resp.status);
    const ab = await resp.arrayBuffer();
    return apply(ab, verFromName(url));
  }

  /* 从本地文件应用（更新 / 降级） */
  async function applyFromFile(file) {
    const ab = await file.arrayBuffer();
    return apply(ab, verFromName(file.name));
  }

  function cachedVersion() {
    try { return localStorage.getItem(VER_KEY); } catch (e) { return null; }
  }

  function supported() {
    return !!(self.navigator && self.navigator.serviceWorker &&
      'caches' in self && 'DecompressionStream' in self && self.isSecureContext);
  }

  let _regPromise = null;
  /* 首次全量缓存完成后，若尚无记录则以当前系统版本作为初始缓存版本 */
  function ensureCachedVersion() {
    try {
      if (!localStorage.getItem(VER_KEY)) {
        const v = OS.version;
        if (v && v.major != null) {
          localStorage.setItem(VER_KEY, 'b' + v.major + '.' + v.minor + '.' + v.build);
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  function register() {
    if (!supported()) {
      return Promise.reject(new Error('需 HTTPS 且浏览器支持 Service Worker / Cache / DecompressionStream'));
    }
    if (!_regPromise) {
      _regPromise = self.navigator.serviceWorker.register('sw.js', { scope: './' })
        .then((reg) => {
          if (self.navigator.serviceWorker.ready) {
            self.navigator.serviceWorker.ready.then(() => ensureCachedVersion());
          }
          return reg;
        })
        .catch((e) => { _regPromise = null; throw e; });
    }
    return _regPromise;
  }

  /* 预缓存是否就绪（首次全量缓存完成） */
  async function precacheReady() {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    return keys.length > 0;
  }

  /* 清理：删除本地缓存与记录（回到未缓存状态） */
  async function clear() {
    await caches.delete(CACHE);
    localStorage.removeItem(VER_KEY);
  }

  OS.ota = OS.ota || {};
  OS.ota.local = {
    CACHE,
    supported,
    register,
    unzip,
    apply,
    applyFromUrl,
    applyFromFile,
    cachedVersion,
    precacheReady,
    clear,
    verFromName,
    parseVer,
    cmpVer
  };

  /* 静默注册：环境不支持时不影响站点正常使用 */
  if (self.document && supported()) {
    if (self.document.readyState === 'loading') {
      self.document.addEventListener('DOMContentLoaded', () => register().catch(() => {}));
    } else {
      register().catch(() => {});
    }
  }
})();
