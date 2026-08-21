/* ============================================================
 * nsos - storage.js (P0.4)
 * 持久化封装：localStorage + 版本号。
 * 壁纸 / 主题 / 设置等系统配置统一走这里，带容错。
 * ============================================================ */
(function (global) {
  'use strict';

  const DEFAULT_NS = 'nsos';
  const DEFAULT_VERSION = 1;

  class OSStorage {
    /**
     * @param {string} ns      存储命名空间（key 前缀）
     * @param {number} version 数据版本，升级可迁移
     */
    constructor(ns = DEFAULT_NS, version = DEFAULT_VERSION) {
      this.ns = ns;
      this.version = version;
      this._available = this._detect();
    }

    _detect() {
      try {
        const k = `${this.ns}:__probe__`;
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) {
        console.warn('[OSStorage] localStorage unavailable, fallback to memory.', e);
        return false;
      }
    }

    _key(name) { return `${this.ns}:v${this.version}:${name}`; }

    /** 读配置，缺失或解析失败返回 fallback */
    get(name, fallback = null) {
      const raw = this._readRaw(name);
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    }

    /** 写配置 */
    set(name, value) {
      this._writeRaw(name, JSON.stringify(value));
      return value;
    }

    /** 删除配置 */
    remove(name) {
      if (!this._available) return;
      try { global.localStorage.removeItem(this._key(name)); } catch (e) { /* noop */ }
    }

    /** 读原始字符串 */
    _readRaw(name) {
      if (!this._available) return null;
      try { return global.localStorage.getItem(this._key(name)); } catch (e) { return null; }
    }

    /** 写原始字符串 */
    _writeRaw(name, str) {
      if (!this._available) return;
      try { global.localStorage.setItem(this._key(name), str); } catch (e) {
        console.warn('[OSStorage] write failed (maybe quota):', name, e);
      }
    }

    /** 当前命名空间下所有 key 列表 */
    keys() {
      if (!this._available) return [];
      const prefix = `${this.ns}:v${this.version}:`;
      const out = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    }
  }

  global.OSStorage = OSStorage;
})(window);
