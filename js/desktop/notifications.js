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

    init() {
      // 从 storage 恢复历史通知
      this.items = OS.storage.get('notif:items', []).slice(0, this.MAX);
      this._buildBadge();

      // 每次进入桌面时触发一次演示推送（60s 内仅一次）
      OS.bus.on('state:enter:home', () => this._demo());
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
        if (OS.controlcenter) OS.controlcenter.toggle();
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
    },

    _persist() { OS.storage.set('notif:items', this.items); },

    /* ---------- 演示推送 ---------- */
    _demo() {
      const now = Date.now();
      const last = OS.storage.get('notif:demo', 0);
      if (now - last < 60000) return;
      OS.storage.set('notif:demo', now);
      this.post({ icon: 'wifi', title: '系统更新完成', text: 'nsos 0.1.0 已就绪，开机画面已焕新', app: 'system' });
      this.post({ icon: 'messages', title: '通知中心上线', text: '下拉状态栏查看通知与快捷开关', app: 'system' });
      this.post({ icon: 'bell', title: '欢迎使用 nsos', text: '上滑返回桌面 · 边缘滑动返回', app: 'system' });
    }
  });
})(window);
