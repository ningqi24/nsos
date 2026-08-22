/* ============================================================
 * nsos - control-center.js (P3.2)
 * 控制中心：状态栏下拉面板
 *   快捷开关（Wi-Fi / 蓝牙 / 飞行 / 手电 / 省电 / 静音 / 免打扰 / 深色）
 *   亮度 / 音量滑杆（亮度实时作用于页面）
 *   通知列表（数据源 OS.notify）
 * 开关状态持久化到 storage（key: cc:<id>）。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const TOGGLES = [
    { id: 'wifi',      label: 'Wi-Fi',   icon: '📶' },
    { id: 'bluetooth', label: '蓝牙',    icon: '🔵' },
    { id: 'airplane',  label: '飞行',    icon: '✈️' },
    { id: 'torch',     label: '手电筒',  icon: '🔦' },
    { id: 'save',      label: '省电',    icon: '🔋' },
    { id: 'mute',      label: '静音',    icon: '🔕' },
    { id: 'doze',      label: '免打扰',  icon: '🌙' },
    { id: 'dark',      label: '深色',    icon: '🌓' }
  ];

  const CC = {
    panel: null,

    init() {
      const host = document.getElementById('os-sysui');
      if (!host) return;

      const panel = document.createElement('div');
      panel.id = 'sys-cc-panel';
      panel.innerHTML = `
        <div class="cc-toggles"></div>
        <div class="cc-sliders">
          <div class="cc-slider"><span>🔅 亮度</span><os-slider id="cc-brightness" min="20" max="100" value="100"></os-slider></div>
          <div class="cc-slider"><span>🔊 音量</span><os-slider id="cc-volume" min="0" max="100" value="60"></os-slider></div>
        </div>
        <div class="cc-notifs" id="cc-notifs"></div>`;
      host.appendChild(panel);
      this.panel = panel;

      this._buildToggles(panel.querySelector('.cc-toggles'));
      this._bindSliders();

      // 点击面板外部区域关闭
      document.addEventListener('pointerdown', (e) => {
        if (this.panel.classList.contains('open') && !this.panel.contains(e.target)) {
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
        el.innerHTML = `<span class="tog-ic">${t.icon}</span><span class="tog-nm">${t.label}</span>`;
        const sw = document.createElement('os-switch');
        if (on) sw.setAttribute('checked', '');
        sw.className = 'cc-sw';
        sw.addEventListener('change', (e) => {
          const next = e.detail.checked;
          el.classList.toggle('on', next);
          OS.storage.set(key, next);
          OS.bus.emit('cc:toggle', { id: t.id, on: next });
        });
        el.appendChild(sw);
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

    _renderNotifs() {
      const box = this.panel.querySelector('#cc-notifs');
      if (!box) return;
      const items = (OS.notify && OS.notify.items) || [];
      if (items.length === 0) {
        box.innerHTML = '<div class="cc-notif-empty">暂无通知</div>';
        return;
      }
      box.innerHTML = '';
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
        box.appendChild(row);
      });
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
