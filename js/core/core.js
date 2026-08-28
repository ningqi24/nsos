/* ============================================================
 * nsos - core.js (P0.5)
 * 系统根对象 window.OS：所有内核模块在此注册、汇聚。
 * OS.bus       事件总线
 * OS.storage   持久化
 * OS.state     状态机（由 main.js 初始化时挂载）
 * OS.version   系统版本
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS = global.OS || {};

  OS.name = 'nsos';
  OS.version = { major: 0, minor: 1, build: 7, codename: 'Kernel' };

  // 事件总线（先于一切模块存在）
  OS.bus = new global.OSEventBus();

  // 持久化（命名空间隔离）
  OS.storage = new global.OSStorage('nsos', 1);

  /** 注册子模块到 OS 上，如 OS.reg('theme', themeMod) -> OS.theme */
  OS.reg = function (name, mod) {
    if (OS[name] && OS[name]._core === true) {
      throw new Error(`[core] "${name}" is a reserved core field, cannot override`);
    }
    OS[name] = mod;
    OS.bus.emit('os:module', { name, mod });
    return mod;
  };

  /** 系统就绪标志 */
  OS.ready = false;
  OS.bootReady = function () {
    OS.ready = true;
    OS.bus.emit('os:ready');
  };

  // 标记核心字段，防误覆盖
  ['bus', 'storage', 'state', 'reg', 'version', 'ready'].forEach(k => {
    const guard = { _core: true };
    // bus / version 已占用，直接标记
    if (k === 'bus' || k === 'version' || k === 'storage') {
      try { OS[k]._core = true; } catch (e) { /* noop */ }
    }
  });

  // 暴露到全局，方便控制台调试
  global.NSOS = OS;
})(window);
