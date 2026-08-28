/* ============================================================
 * nsos - launcher.js (P2.3 / P2.4 · P4.1 manifest 化)
 * 桌面 Launcher：渲染壁纸上的图标网格 + Dock。
 * 数据完全来自 OS.apps 应用注册表（app-registry.js），
 * 与具体应用零耦合——注册一个 manifest 即自动上桌。
 * 点击图标 → OS.nav.push 进入应用任务栈。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const LAUNCHER = {
    init() {
      this._buildGrid();
      this._buildDock();
    },

    _buildGrid() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;
      OS.apps.list().forEach((app) => grid.appendChild(this._makeIcon(app)));
    },

    _buildDock() {
      const dock = document.querySelector('.launcher-dock');
      if (!dock) return;
      OS.apps.dock().forEach((app) => dock.appendChild(this._makeIcon(app)));
    },

    _makeIcon(app) {
      const el = document.createElement('div');
      el.className = 'app-icon';
      el.innerHTML = `<div class="ic ${app.cls}"><os-icon name="${app.icon}"></os-icon></div><span class="nm">${app.name}</span>`;
      el.addEventListener('click', () => OS.bus.emit('launcher:launch', { app }));
      return el;
    }
  };

  OS.reg('launcher', LAUNCHER);
})(window);
