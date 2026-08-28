/* ============================================================
 * nsos - notifications.js (P3.1)
 * 通知服务：全局通知管理 + 状态栏铃铛角标 + 通知数据源。
 *   OS.notify.post({ icon, title, text, app })  发布通知
 *   OS.notify.remove(id)                        移除单条
 *   OS.notify.clearAll()                        清空全部
 * 通知持久化到 storage（key: notif:items，最多 20 条）。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  OS.reg('notify', {
    items: [],
    MAX: 20,
    panel: null,

    init() {
      // 从 storage 恢复历史通知
      this.items = OS.storage.get('notif:items', []).slice(0, this.MAX);
      this._buildPanel();
      this._buildBadge();

      // 每次进入桌面时触发一次演示推送（60s 内仅一次）
      OS.bus.on('state:enter:home', () => this._demo());
    },

    /* ---------- 通知中心面板 ---------- */
    _buildPanel() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const panel = document.createElement('div');
      panel.id = 'sys-nc-panel';
      panel.innerHTML = `
        <div class="nc-header">
          <div class="nc-title">通知中心</div>
          <button class="nc-clear">清除全部</button>
        </div>
        <div class="nc-list" id="nc-list"></div>`;
      sysui.appendChild(panel);
      this.panel = panel;

      // 清除全部
      panel.querySelector('.nc-clear').addEventListener('click', () => {
        this.clearAll();
      });

      // 点击面板外部区域关闭（用 composedPath 兼容 Shadow DOM）
      document.addEventListener('pointerdown', (e) => {
        if (!this.panel.classList.contains('open')) return;
        const path = e.composedPath();
        const inPanel = path.some(el => el === this.panel);
        const inStatusBar = path.some(el => el.closest && el.closest('#sys-statusbar'));
        if (!inPanel && !inStatusBar) {
          this.closePanel();
        }
      });

      // 通知变化时刷新面板
      OS.bus.on('notify:post', () => {
        if (this.panel.classList.contains('open')) this._renderPanel();
      });
      OS.bus.on('notify:change', () => {
        if (this.panel.classList.contains('open')) this._renderPanel();
      });
    },

    openPanel() {
      if (!this.panel) return;
      this.panel.classList.add('open');
      this._renderPanel();
      // 打开控制中心时关闭通知中心，反之亦然
      if (OS.controlcenter && OS.controlcenter.panel.classList.contains('open')) {
        OS.controlcenter.close();
      }
    },

    closePanel() {
      if (this.panel) this.panel.classList.remove('open');
    },

    togglePanel() {
      if (!this.panel) return;
      if (this.panel.classList.contains('open')) this.closePanel();
      else this.openPanel();
    },

    _renderPanel() {
      const list = this.panel.querySelector('#nc-list');
      if (!list) return;
      if (this.items.length === 0) {
        list.innerHTML = '<div class="nc-empty">暂无通知</div>';
        return;
      }
      list.innerHTML = '';
      this.items.forEach(n => {
        const el = document.createElement('div');
        el.className = 'nc-item';
        const app = n.app && OS.apps ? OS.apps.get(n.app) : null;
        const iconCls = app ? app.cls : 'ic-blue';
        const timeStr = this._formatTime(n.time);
        el.innerHTML = `
          <div class="nc-icon ic ${iconCls}"><os-icon name="${n.icon}" size="16"></os-icon></div>
          <div class="nc-body">
            <div class="nc-row">
              <span class="nc-title">${n.title}</span>
              <span class="nc-time">${timeStr}</span>
            </div>
            <div class="nc-text">${n.text}</div>
          </div>
          <button class="nc-item-close">×</button>`;
        el.querySelector('.nc-item-close').addEventListener('click', (e) => {
          e.stopPropagation();
          this.remove(n.id);
        });
        el.addEventListener('click', () => {
          if (n.app && OS.apps.has(n.app)) {
            this.closePanel();
            setTimeout(() => OS.nav.push(n.app), 200);
          }
        });
        list.appendChild(el);
      });
    },

    _formatTime(ts) {
      const d = new Date(ts);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      return (d.getMonth() + 1) + '/' + d.getDate();
    },

    /** 发布一条通知，返回通知对象 */
    post(n) {
      const item = {
        id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
        time: Date.now(),
        icon: n.icon || 'bell',
        title: n.title || '通知',
        text: n.text || '',
        app: n.app || 'system',
        read: false
      };
      this.items.unshift(item);
      if (this.items.length > this.MAX) this.items.pop();
      this._persist();
      this._updateBadge();
      OS.bus.emit('notify:post', { item });
      // 显示顶部通知横幅
      this._showBanner(item);
      return item;
    },

    remove(id) {
      this.items = this.items.filter(i => i.id !== id);
      this._persist();
      this._updateBadge();
      OS.bus.emit('notify:change');
    },

    clearAll() {
      this.items = [];
      this._persist();
      this._updateBadge();
      OS.bus.emit('notify:change');
    },

    unread() { return this.items.filter(i => !i.read).length; },

    /* ---------- 状态栏铃铛 + 角标（os-badge 组件） ---------- */
    _buildBadge() {
      const right = document.querySelector('#sys-statusbar .sb-right');
      if (!right) return;
      const badge = document.createElement('span');
      badge.id = 'sb-notif';
      badge.className = 'sb-notif';
      badge.innerHTML = '<span class="sb-bell"><os-icon name="bell" size="15"></os-icon></span>';
      const dot = document.createElement('os-badge');
      dot.id = 'sb-bell-dot';
      dot.setAttribute('count', '0');
      badge.appendChild(dot);
      badge.addEventListener('click', () => {
        this.togglePanel();
      });
      right.prepend(badge);
      this._updateBadge();
    },

    _updateBadge() {
      const dot = document.getElementById('sb-bell-dot');
      const bell = document.querySelector('#sb-notif .sb-bell');
      if (!dot || !bell) return;
      const u = this.unread();
      if (u > 0) dot.setAttribute('count', String(u));
      else dot.removeAttribute('count');
      bell.style.opacity = u > 0 ? '1' : '.5';
      this._updateAppBadges();
    },

    /* 更新桌面应用图标上的角标 */
    _updateAppBadges() {
      // 计算每个应用的未读通知数
      const counts = {};
      this.items.forEach(i => {
        if (!i.read && i.app) {
          counts[i.app] = (counts[i.app] || 0) + 1;
        }
      });
      // 遍历桌面图标，设置角标
      document.querySelectorAll('.launcher-grid .app-icon, .launcher-dock .app-icon').forEach(icon => {
        const appName = icon.querySelector('.nm')?.textContent;
        const manifest = OS.apps ? OS.apps.list().concat(OS.apps.dock()).find(a => a.name === appName) : null;
        const appId = manifest ? manifest.id : appName;
        const count = counts[appId] || 0;
        let badge = icon.querySelector('.app-badge');
        if (count > 0) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'app-badge';
            icon.querySelector('.ic').appendChild(badge);
          }
          badge.textContent = count > 99 ? '99+' : count;
        } else if (badge) {
          badge.remove();
        }
      });
    },

    _persist() { OS.storage.set('notif:items', this.items); },

    /* ---------- 顶部通知横幅（Heads-up Banner） ---------- */
    _showBanner(item) {
      // 免打扰模式下不显示横幅
      if (OS.storage.get('cc:doze', false)) return;
      // 不在锁屏显示（锁屏有自己的通知显示）
      if (OS.state.current === 'locked') return;
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      // 移除已有横幅
      this._dismissBanner();
      const banner = document.createElement('div');
      banner.className = 'notif-banner';
      const appManifest = item.app && OS.apps ? OS.apps.get(item.app) : null;
      const iconCls = appManifest ? appManifest.cls : 'ic-blue';
      banner.innerHTML = `
        <div class="nb-icon ic ${iconCls}"><os-icon name="${item.icon}" size="16"></os-icon></div>
        <div class="nb-body">
          <div class="nb-title">${item.title}</div>
          <div class="nb-text">${item.text}</div>
        </div>
        <button class="nb-close">×</button>`;
      // 点击横幅
      banner.addEventListener('click', (e) => {
        if (e.target.classList.contains('nb-close')) {
          this._dismissBanner();
          return;
        }
        // 点击打开对应应用
        this._dismissBanner();
        if (item.app && OS.apps.has(item.app)) {
          OS.nav.push(item.app);
        }
      });
      sysui.appendChild(banner);
      this._bannerEl = banner;
      // 自动消失（5 秒）
      this._bannerTimer = setTimeout(() => this._dismissBanner(), 5000);
      // 进入动画
      requestAnimationFrame(() => banner.classList.add('show'));
    },

    _dismissBanner() {
      if (!this._bannerEl) return;
      clearTimeout(this._bannerTimer);
      this._bannerEl.classList.remove('show');
      this._bannerEl.classList.add('hide');
      setTimeout(() => {
        if (this._bannerEl) {
          this._bannerEl.remove();
          this._bannerEl = null;
        }
      }, 400);
    },

    /* ---------- 演示推送 ---------- */
    _demo() {
      const now = Date.now();
      const last = OS.storage.get('notif:demo', 0);
      if (now - last < 60000) return;
      OS.storage.set('notif:demo', now);
      this.post({ icon: 'wifi', title: '系统更新完成', text: 'nsos b0.1.9 已就绪，应用体系全面升级', app: 'system' });
      this.post({ icon: 'messages', title: '通知中心上线', text: '下拉状态栏查看通知与快捷开关', app: 'system' });
      this.post({ icon: 'bell', title: '欢迎使用 nsos', text: '上滑返回桌面 · 边缘滑动返回', app: 'system' });
    }
  });
})(window);
