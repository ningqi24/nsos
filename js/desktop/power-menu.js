/* ============================================================
 * nsos - power-menu.js
 * 系统电源菜单：关机 / 重启 / 紧急呼叫 / 取消
 *   触发：长按电源键（模拟为状态栏右键）或 Ctrl+Shift+P
 *   Apple-style 圆形按钮 + 确认弹窗
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const PM = {
    overlay: null,

    init() {
      // 键盘快捷键：Ctrl+Shift+P
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
          e.preventDefault();
          this.show();
        }
      });

      // 状态栏右键 -> 电源菜单
      const sb = document.getElementById('sys-statusbar');
      if (sb) {
        sb.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.show();
        });
      }
    },

    show() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      if (this.overlay) return; // 已显示

      const overlay = document.createElement('div');
      overlay.className = 'power-menu-overlay';
      overlay.innerHTML = `
        <div class="pm-card">
          <div class="pm-sliders">
            <button class="pm-btn pm-power-off" id="pm-off">
              <span class="pm-ic"><os-icon name="power" size="20"></os-icon></span>
              <span class="pm-label">关机</span>
            </button>
            <button class="pm-btn pm-restart" id="pm-restart">
              <span class="pm-ic"><os-icon name="refresh" size="20"></os-icon></span>
              <span class="pm-label">重启</span>
            </button>
          </div>
          <button class="pm-cancel" id="pm-cancel">取消</button>
        </div>`;
      sysui.appendChild(overlay);
      this.overlay = overlay;

      requestAnimationFrame(() => overlay.classList.add('show'));

      overlay.querySelector('#pm-off').addEventListener('click', () => this._confirmAction('off'));
      overlay.querySelector('#pm-restart').addEventListener('click', () => this._confirmAction('restart'));
      overlay.querySelector('#pm-cancel').addEventListener('click', () => this.hide());
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) this.hide();
      });
    },

    hide() {
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

    _confirmAction(action) {
      if (action === 'off') {
        this.hide();
        // 显示关机确认
        this._showConfirm('关机', '确定要关闭 nsos 吗？', () => {
          OS.state.transition('poweroff', { source: 'power-menu' });
        });
      } else if (action === 'restart') {
        this.hide();
        this._showConfirm('重启', '确定要重启 nsos 吗？', () => {
          // 重启 = 关机后自动开机
          OS.state.transition('poweroff', { source: 'power-menu-restart' });
          setTimeout(() => {
            OS.state.transition('boot', { source: 'restart' });
          }, 1500);
        });
      }
    },

    _showConfirm(title, text, onConfirm) {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const dialog = document.createElement('div');
      dialog.className = 'power-confirm-overlay';
      dialog.innerHTML = `
        <div class="pc-card">
          <div class="pc-title">${title}</div>
          <div class="pc-text">${text}</div>
          <div class="pc-actions">
            <button class="pc-cancel">取消</button>
            <button class="pc-confirm">确认</button>
          </div>
        </div>`;
      sysui.appendChild(dialog);
      requestAnimationFrame(() => dialog.classList.add('show'));
      dialog.querySelector('.pc-cancel').addEventListener('click', () => {
        dialog.classList.remove('show');
        setTimeout(() => dialog.remove(), 300);
      });
      dialog.querySelector('.pc-confirm').addEventListener('click', () => {
        dialog.classList.remove('show');
        setTimeout(() => {
          dialog.remove();
          onConfirm();
        }, 300);
      });
    }
  };

  OS.reg('powermenu', PM);
})(window);
