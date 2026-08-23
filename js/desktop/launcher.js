/* ============================================================
 * nsos - launcher.js (P2.3 / P2.4)
 * 桌面 Launcher：渲染壁纸上的图标网格 + Dock。
 * 图标数据驱动，点击进入 App（P5 占位）。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  // 桌面应用清单（P5 会替换为真实应用容器）
  const APPS = [
    { id: 'photos',  name: '相册',   icon: 'photos',  cls: 'ic-blue'   },
    { id: 'camera',  name: '相机',   icon: 'camera',  cls: 'ic-purple' },
    { id: 'clock',   name: '时钟',   icon: 'clock',   cls: 'ic-green'  },
    { id: 'weather', name: '天气',   icon: 'weather', cls: 'ic-cyan'   },
    { id: 'notes',   name: '备忘录', icon: 'notes',   cls: 'ic-orange' },
    { id: 'settings',name: '设置',   icon: 'settings',cls: 'ic-red'    },
    { id: 'browser', name: '浏览器', icon: 'browser', cls: 'ic-blue'   },
    { id: 'music',   name: '音乐',   icon: 'music',   cls: 'ic-purple' },
    { id: 'terminal',name: '终端',   icon: 'terminal',cls: 'ic-green'  }
  ];

  const DOCK = [
    { id: 'phone',   name: '电话', icon: 'phone',   cls: 'ic-green'  },
    { id: 'messages',name: '短信', icon: 'messages',cls: 'ic-cyan'   },
    { id: 'apps',    name: '应用', icon: 'apps',    cls: 'ic-orange' },
    { id: 'camera2', name: '相机', icon: 'camera',  cls: 'ic-purple' }
  ];

  const LAUNCHER = {
    init() {
      this._buildGrid();
      this._buildDock();
    },

    _buildGrid() {
      const grid = document.querySelector('.launcher-grid');
      if (!grid) return;
      APPS.forEach((app) => grid.appendChild(this._makeIcon(app)));
    },

    _buildDock() {
      const dock = document.querySelector('.launcher-dock');
      if (!dock) return;
      DOCK.forEach((app) => dock.appendChild(this._makeIcon(app)));
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
