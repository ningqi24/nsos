/* ============================================================
 * nsos - builtin-apps.js (P4.3 · 对标 MobileGym apps/ 目录)
 * 内置应用 manifest 注册：全部图标清单 + 真实应用挂载。
 *   settings / terminal 复用现有 Web Component（迁移为 manifest）
 *   clock           新增真实应用（manifest 插拔式 demo）
 *   其余应用        placeholder 占位，容器建设中
 * 桌面 / Dock 渲染由 launcher 读 OS.apps 完成，与本文件零耦合。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  /* ---------- 真实应用 ---------- */

  // 设置：复用 os-settings Web Component
  OS.apps.register({
    id: 'settings',
    name: '设置',
    icon: 'settings',
    cls: 'ic-red',
    version: '1.0.0',
    description: '设备信息 + 系统更新（真实应用）',
    mount(host) {
      const el = document.createElement('os-settings');
      host.appendChild(el);
      return () => { el.remove(); };
    },
  });

  // 终端：复用 os-terminal Web Component
  OS.apps.register({
    id: 'terminal',
    name: '终端',
    icon: 'terminal',
    cls: 'ic-green',
    version: '1.0.0',
    description: 'nsos 统一命令引擎（真实应用）',
    mount(host) {
      const el = document.createElement('os-terminal');
      host.appendChild(el);
      setTimeout(() => { try { el.focus(); } catch (e) { /* noop */ } }, 60);
      return () => { el.remove(); };
    },
  });

  // 时钟：新增真实应用（体现 manifest 插拔式：加一个 manifest 即上桌）
  OS.apps.register({
    id: 'clock',
    name: '时钟',
    icon: 'clock',
    cls: 'ic-green',
    version: '1.0.0',
    description: '实时时钟（manifest 应用 demo）',
    mount(host) {
      const pad = n => String(n).padStart(2, '0');
      host.innerHTML =
        '<div class="app-clock">' +
        '<div class="ck-time">--:--</div>' +
        '<div class="ck-date">----</div>' +
        '<div class="ck-sub">nsos App · manifest 插拔式</div>' +
        '</div>';
      const tEl = host.querySelector('.ck-time');
      const dEl = host.querySelector('.ck-date');
      const tick = () => {
        const now = new Date();
        tEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
        dEl.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
      };
      tick();
      const iv = setInterval(tick, 1000);
      return () => clearInterval(iv);   // 离开帧时清理定时器
    },
  });

  /* ---------- P5 占位应用（继承原有图标清单，待逐个实现） ---------- */
  const PLACEHOLDER = [
    { id: 'photos',  name: '相册',   icon: 'photos',  cls: 'ic-blue'   },
    { id: 'camera',  name: '相机',   icon: 'camera',  cls: 'ic-purple' },
    { id: 'weather', name: '天气',   icon: 'weather', cls: 'ic-cyan'   },
    { id: 'notes',   name: '备忘录', icon: 'notes',   cls: 'ic-orange' },
    { id: 'browser', name: '浏览器', icon: 'browser', cls: 'ic-blue'   },
    { id: 'music',   name: '音乐',   icon: 'music',   cls: 'ic-purple' },
  ];
  PLACEHOLDER.forEach(p => OS.apps.register({
    ...p, version: '0.1.0', placeholder: true, description: 'P5 占位，应用容器建设中',
  }));

  /* ---------- Dock ---------- */
  OS.apps.register({ id: 'phone',    name: '电话', icon: 'phone',    cls: 'ic-green',  dock: true, placeholder: true, description: 'P5 占位' });
  OS.apps.register({ id: 'messages', name: '短信', icon: 'messages', cls: 'ic-cyan',   dock: true, placeholder: true, description: 'P5 占位' });
  OS.apps.register({ id: 'apps',     name: '应用', icon: 'apps',     cls: 'ic-orange', dock: true, placeholder: true, description: 'P5 占位（应用抽屉）' });
  OS.apps.register({ id: 'camera2',  name: '相机', icon: 'camera',   cls: 'ic-purple', dock: true, placeholder: true, description: 'P5 占位' });
})(window);
