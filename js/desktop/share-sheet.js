/* ============================================================
 * nsos - share-sheet.js
 * 系统分享面板：底部弹出的分享 UI
 *   使用：OS.share.open({ title, text, url })
 *   分享渠道：复制链接、短信、邮件、蓝牙、更多...
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const CHANNELS = [
    { id: 'copy', label: '拷贝', icon: 'copy', color: 'ic-blue' },
    { id: 'messages', label: '短信', icon: 'messages', color: 'ic-green', app: 'messages' },
    { id: 'mail', label: '邮件', icon: 'mail', color: 'ic-blue', app: 'mail' },
    { id: 'bluetooth', label: '蓝牙', icon: 'bluetooth', color: 'ic-blue' },
    { id: 'airdrop', label: '隔空投送', icon: 'share', color: 'ic-purple' },
    { id: 'notes', label: '备忘录', icon: 'notes', color: 'ic-yellow', app: 'notes' },
    { id: 'browser', label: '浏览器', icon: 'browser', color: 'ic-teal', app: 'browser' },
  ];

  const SS = {
    overlay: null,

    open(data) {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      this.close(); // 关闭已有面板

      const overlay = document.createElement('div');
      overlay.className = 'share-sheet-overlay';
      overlay.innerHTML = `
        <div class="ss-card">
          <div class="ss-handle"></div>
          ${data.title ? `<div class="ss-title">${data.title}</div>` : ''}
          ${data.text ? `<div class="ss-text">${data.text}</div>` : ''}
          <div class="ss-channels"></div>
          <button class="ss-cancel">取消</button>
        </div>`;
      sysui.appendChild(overlay);
      this.overlay = overlay;

      const channelsEl = overlay.querySelector('.ss-channels');
      CHANNELS.forEach(ch => {
        const el = document.createElement('div');
        el.className = 'ss-channel';
        el.innerHTML = `
          <span class="ss-ch-ic ic ${ch.color}"><os-icon name="${ch.icon}" size="18"></os-icon></span>
          <span class="ss-ch-label">${ch.label}</span>`;
        el.addEventListener('click', () => this._handleChannel(ch, data));
        channelsEl.appendChild(el);
      });

      overlay.querySelector('.ss-cancel').addEventListener('click', () => this.close());
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) this.close();
      });

      requestAnimationFrame(() => overlay.classList.add('show'));
    },

    close() {
      if (!this.overlay) return;
      this.overlay.classList.remove('show');
      this.overlay.classList.add('hide');
      setTimeout(() => {
        if (this.overlay) {
          this.overlay.remove();
          this.overlay = null;
        }
      }, 400);
    },

    _handleChannel(ch, data) {
      const toast = OS.ui && OS.ui.toast;
      switch (ch.id) {
        case 'copy':
          if (data.url || data.text) {
            try {
              navigator.clipboard.writeText(data.url || data.text);
              if (toast) toast('已拷贝到剪贴板', { ms: 1200 });
            } catch (e) {
              if (toast) toast('拷贝失败', { ms: 1200 });
            }
          }
          this.close();
          break;
        case 'bluetooth':
          if (toast) toast('蓝牙分享已发起…', { ms: 1500 });
          this.close();
          break;
        case 'airdrop':
          if (toast) toast('正在搜索附近设备…', { ms: 1500 });
          this.close();
          break;
        default:
          if (ch.app) {
            this.close();
            setTimeout(() => OS.nav.push(ch.app), 200);
          }
          break;
      }
    }
  };

  OS.reg('share', SS);
})(window);
