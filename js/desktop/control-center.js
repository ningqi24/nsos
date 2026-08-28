/* ============================================================
 * nsos - control-center.js (P3.2 / P5 增强)
 * 控制中心：状态栏下拉面板
 *   快捷开关（Wi-Fi / 蓝牙 / 飞行 / 手电 / 省电 / 静音 / 免打扰 / 深色）
 *   亮度 / 音量滑杆（亮度实时作用于页面）
 *   媒体控制（上一曲 / 播放暂停 / 下一曲）
 *   通知列表（数据源 OS.notify）
 *   快捷功能（手电筒 / 计算器 / 计时器 / 相机）
 * 开关状态持久化到 storage（key: cc:<id>）。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const TOGGLES = [
    { id: 'wifi',      label: 'Wi-Fi',   icon: 'wifi'      },
    { id: 'bluetooth', label: '蓝牙',    icon: 'bluetooth' },
    { id: 'airplane',  label: '飞行',    icon: 'airplane'  },
    { id: 'torch',     label: '手电筒',  icon: 'torch'     },
    { id: 'save',      label: '省电',    icon: 'save'      },
    { id: 'mute',      label: '静音',    icon: 'mute'      },
    { id: 'doze',      label: '免打扰',  icon: 'doze'      },
    { id: 'dark',      label: '深色',    icon: 'dark'      }
  ];

  const SHORTCUTS = [
    { id: 'flashlight', label: '手电筒', icon: 'torch',    app: null },
    { id: 'timer',      label: '计时器', icon: 'clock',     app: 'clock' },
    { id: 'calc',       label: '计算器', icon: 'calculator', app: 'calculator' },
    { id: 'camera',     label: '相机',   icon: 'camera',    app: 'camera2' },
  ];

  const CC = {
    panel: null,

    init() {
      const host = document.getElementById('os-sysui');
      if (!host) return;

      const panel = document.createElement('div');
      panel.id = 'sys-cc-panel';
      panel.innerHTML = `
        <div class="cc-media" id="cc-media">
          <div class="cc-media-info">
            <div class="cc-media-art"><os-icon name="music" size="20"></os-icon></div>
            <div class="cc-media-text">
              <div class="cc-media-title">未在播放</div>
              <div class="cc-media-artist">—</div>
            </div>
          </div>
          <div class="cc-media-controls">
            <button class="cc-media-btn" id="cc-m-prev"><os-icon name="skip-prev" size="18"></os-icon></button>
            <button class="cc-media-btn cc-media-play" id="cc-m-play"><os-icon name="play" size="20"></os-icon></button>
            <button class="cc-media-btn" id="cc-m-next"><os-icon name="skip-next" size="18"></os-icon></button>
          </div>
        </div>
        <div class="cc-toggles"></div>
        <div class="cc-sliders">
          <div class="cc-slider"><os-icon name="brightness" size="20"></os-icon><os-slider id="cc-brightness" min="20" max="100" value="100"></os-slider></div>
          <div class="cc-slider"><os-icon name="volume" size="20"></os-icon><os-slider id="cc-volume" min="0" max="100" value="60"></os-slider></div>
        </div>
        <div class="cc-shortcuts" id="cc-shortcuts"></div>
        <div class="cc-notifs" id="cc-notifs"></div>`;
      host.appendChild(panel);
      this.panel = panel;

      this._buildToggles(panel.querySelector('.cc-toggles'));
      this._buildShortcuts(panel.querySelector('#cc-shortcuts'));
      this._bindSliders();
      this._bindMediaControls();

      // 点击面板外部区域关闭
      document.addEventListener('pointerdown', (e) => {
        if (this.panel.classList.contains('open') && !this.panel.contains(e.target) &&
            !(e.target.closest('#sys-statusbar'))) {
          this.close();
        }
      });

      // 通知数据变化 -> 重渲染列表
      OS.bus.on('notify:post', () => this._renderNotifs());
      OS.bus.on('notify:change', () => this._renderNotifs());
    },

    _buildToggles(container) {
      TOGGLES.forEach((t) => {
        const key = 'cc:' + t.id;
        const on = OS.storage.get(key, t.id === 'wifi' || t.id === 'dark');
        const el = document.createElement('div');
        el.className = 'cc-tog' + (on ? ' on' : '');
        el.innerHTML = `<span class="tog-ic"><os-icon name="${t.icon}"></os-icon></span><span class="tog-nm">${t.label}</span>`;
        el.addEventListener('click', () => {
          const next = !el.classList.contains('on');
          el.classList.toggle('on', next);
          OS.storage.set(key, next);
          OS.bus.emit('cc:toggle', { id: t.id, on: next });
          const toast = OS.ui && OS.ui.toast;
          if (toast) toast(next ? t.label + ' 已开启' : t.label + ' 已关闭', { ms: 1200 });

          // 深色模式切换：实际应用主题
          if (t.id === 'dark') {
            const root = document.getElementById('os-root');
            if (root) root.classList.toggle('os-theme-light', !next);
          }
        });
        container.appendChild(el);
      });

      // 初始化主题
      const darkOn = OS.storage.get('cc:dark', true);
      const root = document.getElementById('os-root');
      if (root) root.classList.toggle('os-theme-light', !darkOn);
    },

    _buildShortcuts(container) {
      SHORTCUTS.forEach(s => {
        const el = document.createElement('div');
        el.className = 'cc-shortcut';
        el.innerHTML = `<span class="cc-sc-ic"><os-icon name="${s.icon}"></os-icon></span><span class="cc-sc-nm">${s.label}</span>`;
        el.addEventListener('click', () => {
          if (s.app) {
            this.close();
            setTimeout(() => OS.nav.push(s.app), 200);
          }
        });
        container.appendChild(el);
      });
    },

    _bindSliders() {
      const bri = this.panel.querySelector('#cc-brightness');
      const vol = this.panel.querySelector('#cc-volume');
      if (bri) {
        bri.value = OS.storage.get('cc:brightness', 100);
        bri.addEventListener('input', (e) => {
          OS.storage.set('cc:brightness', e.detail.value);
          document.body.style.filter = `brightness(${e.detail.value / 100})`;
        });
      }
      if (vol) {
        vol.value = OS.storage.get('cc:volume', 60);
        vol.addEventListener('change', (e) => OS.storage.set('cc:volume', e.detail.value));
      }
    },

    _bindMediaControls() {
      const mediaEl = this.panel.querySelector('#cc-media');
      const playBtn = this.panel.querySelector('#cc-m-play');
      let isPlaying = false;

      playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.innerHTML = isPlaying
          ? '<os-icon name="pause" size="20"></os-icon>'
          : '<os-icon name="play" size="20"></os-icon>';
        mediaEl.classList.toggle('playing', isPlaying);
        const titleEl = mediaEl.querySelector('.cc-media-title');
        const artistEl = mediaEl.querySelector('.cc-media-artist');
        if (isPlaying) {
          titleEl.textContent = '夜空下的星';
          artistEl.textContent = '光年之外';
        } else {
          titleEl.textContent = '已暂停';
          artistEl.textContent = '光年之外';
        }
        OS.bus.emit('media:toggle', { playing: isPlaying });
      });

      this.panel.querySelector('#cc-m-prev').addEventListener('click', () => {
        const toast = OS.ui && OS.ui.toast; if (toast) toast('上一曲', { ms: 800 });
      });
      this.panel.querySelector('#cc-m-next').addEventListener('click', () => {
        const toast = OS.ui && OS.ui.toast; if (toast) toast('下一曲', { ms: 800 });
      });
    },

    _renderNotifs() {
      const box = this.panel.querySelector('#cc-notifs');
      if (!box) return;
      const items = (OS.notify && OS.notify.items) || [];
      if (items.length === 0) {
        box.innerHTML = '<div class="cc-notif-empty">暂无通知</div>';
        return;
      }
      box.innerHTML = `<div class="cc-notif-header"><span>${items.length} 条通知</span><button class="cc-clear-all" id="cc-clear-all">全部清除</button></div>`;
      const listEl = document.createElement('div');
      listEl.className = 'cc-notif-list';
      items.forEach((n) => {
        const d = new Date(n.time);
        const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const row = document.createElement('os-list-item');
        if (n.icon) row.setAttribute('icon', n.icon);
        row.setAttribute('title', n.title);
        row.setAttribute('text', n.text);
        row.setAttribute('time', hm);
        if (n.read) row.setAttribute('read', '');
        row.addEventListener('os-dismiss', () => {
          if (OS.notify) OS.notify.remove(n.id);
        });
        row.addEventListener('os-click', () => {
          n.read = true;
          if (OS.notify) { OS.notify._persist(); OS.notify._updateBadge(); OS.bus.emit('notify:change'); }
        });
        listEl.appendChild(row);
      });
      box.appendChild(listEl);

      // 全部清除按钮
      const clearAll = box.querySelector('#cc-clear-all');
      if (clearAll) {
        clearAll.addEventListener('click', () => {
          if (OS.notify && OS.notify.clearAll) {
            OS.notify.clearAll();
          } else if (OS.notify && OS.notify.items) {
            OS.notify.items.length = 0;
            OS.notify._persist();
            OS.notify._updateBadge();
            OS.bus.emit('notify:change');
          }
          this._renderNotifs();
        });
      }
    },

    open() {
      if (!this.panel) return;
      this.panel.classList.add('open');
      this._renderNotifs();
    },

    close() {
      if (this.panel) this.panel.classList.remove('open');
    },

    toggle() {
      if (this.panel.classList.contains('open')) this.close();
      else this.open();
    }
  };

  OS.reg('controlcenter', CC);
})(window);
