/* ============================================================
 * nsos - dynamic-island.js
 * 灵动岛 (Dynamic Island)：顶部胶囊形实时活动区域
 *   显示：音乐播放、计时器、充电状态、通话
 *   状态：收起( compact ) / 展开( expanded )
 *   动画：状态切换时灵动变形
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const DI = {
    el: null,
    _currentActivity: null,
    _expandTimer: null,

    init() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;

      const island = document.createElement('div');
      island.className = 'dynamic-island';
      island.id = 'sys-dynamic-island';
      island.innerHTML = `
        <div class="di-content">
          <div class="di-left"></div>
          <div class="di-right"></div>
        </div>`;
      sysui.appendChild(island);
      this.el = island;
      this.leftEl = island.querySelector('.di-left');
      this.rightEl = island.querySelector('.di-right');

      // 监听媒体控制变化
      OS.bus.on('cc:toggle', (e) => {
        if (e.id === 'torch' && e.on) {
          this.showActivity('torch', { icon: 'torch', text: '手电筒' });
          setTimeout(() => this.hideActivity('torch'), 3000);
        }
      });

      // 监听计时器
      OS.bus.on('clock:timer:active', (e) => {
        if (e.active) {
          this.showActivity('timer', { icon: 'clock', text: e.remaining || '计时中' });
        } else {
          this.hideActivity('timer');
        }
      });

      // 监听充电
      OS.bus.on('device:update', () => {
        const b = OS.device && OS.device.battery;
        if (b && b.charging && OS.device.batterySupported) {
          this.showActivity('charging', { icon: 'battery', text: Math.round(b.level * 100) + '%' });
        } else {
          this.hideActivity('charging');
        }
      });

      // 监听截图
      OS.bus.on('screenshot:taken', () => {
        this.showActivity('screenshot', { icon: 'image', text: '截屏已保存' });
        setTimeout(() => this.hideActivity('screenshot'), 2500);
      });

      // 点击灵动岛展开
      island.addEventListener('click', () => this._toggleExpand());
    },

    showActivity(id, data) {
      if (this._currentActivity === id) {
        // 更新内容
        this._updateContent(data);
        return;
      }
      this._currentActivity = id;
      this.el.classList.add('active');
      this._updateContent(data);
      // 自动展开
      this.el.classList.add('expanded');
      clearTimeout(this._expandTimer);
      this._expandTimer = setTimeout(() => {
        this.el.classList.remove('expanded');
      }, 3000);
    },

    hideActivity(id) {
      if (this._currentActivity !== id) return;
      this._currentActivity = null;
      this.el.classList.remove('active', 'expanded');
    },

    _updateContent(data) {
      if (this.leftEl) {
        this.leftEl.innerHTML = `<span class="di-ic"><os-icon name="${data.icon || 'app'}" size="14"></os-icon></span>`;
      }
      if (this.rightEl) {
        this.rightEl.innerHTML = `<span class="di-text">${data.text || ''}</span>`;
      }
    },

    _toggleExpand() {
      this.el.classList.toggle('expanded');
      clearTimeout(this._expandTimer);
      if (this.el.classList.contains('expanded')) {
        this._expandTimer = setTimeout(() => {
          this.el.classList.remove('expanded');
        }, 4000);
      }
    },
  };

  OS.reg('island', DI);
})(window);
