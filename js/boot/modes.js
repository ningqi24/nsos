/* ============================================================
 * nsos - modes.js (P1.4 ~ P1.6)
 * 工程模式控制器：Fastboot / Recovery 菜单逻辑
 *   方向键/数字键选择，Enter 确认
 *   Recovery 的"清除数据"带二次确认
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const CONFIG = {
    fastboot: {
      menuId: 'ft-menu',
      items: [
        { label: '重启到 Bootloader', action: 'restart-bootloader' },
        { label: '正常启动系统',       action: 'reboot-system' },
        { label: '关机',             action: 'power-off' }
      ]
    },
    recovery: {
      menuId: 'rc-menu',
      items: [
        { label: '重启系统',           action: 'reboot-system' },
        { label: '清除数据（恢复出厂）', action: 'factory-reset' },
        { label: '关机',             action: 'power-off' }
      ]
    }
  };

  const MODES = {
    mode: null,           // 'fastboot' | 'recovery' | null
    index: 0,
    confirmPending: false,
    menu: null,

    init() {
      OS.bus.on('input:key', (e) => this._handleKey(e));
      OS.state.onEnter('fastboot', () => this._open('fastboot'));
      OS.state.onEnter('recovery', () => this._open('recovery'));
      OS.state.onLeave('fastboot', () => { this.mode = null; });
      OS.state.onLeave('recovery', () => { this.mode = null; });
    },

    _open(mode) {
      this.mode = mode;
      this.confirmPending = false;
      this.menu = document.getElementById(CONFIG[mode].menuId);
      this._render();
      this.move(0);
    },

    _render() {
      if (!this.menu) return;
      this.menu.innerHTML = '';
      CONFIG[this.mode].items.forEach((item, i) => {
        const li = document.createElement('li');
        li.textContent = item.label;
        li.dataset.action = item.action;
        li.addEventListener('click', () => { this.move(i); this.choose(); });
        this.menu.appendChild(li);
      });
    },

    move(i) {
      if (!this.menu || this.menu.children.length === 0) return;
      this.index = Math.max(0, Math.min(this.menu.children.length - 1, i));
      Array.from(this.menu.children).forEach((li, idx) => {
        li.classList.toggle('sel', idx === this.index);
      });
    },

    _handleKey(e) {
      const st = OS.state.current;
      if (st !== 'fastboot' && st !== 'recovery') return;
      if (e.type === 'nav') this.move(this.index + (e.dir === 'down' ? 1 : -1));
      else if (e.type === 'select') this.choose();
      else if (e.type === 'digit') { this.move(e.digit - 1); this.choose(); }
    },

    choose() {
      const item = this.menu && this.menu.children[this.index];
      if (!item) return;

      // 恢复出厂的二次确认
      if (this.mode === 'recovery' && item.dataset.action === 'factory-reset') {
        if (!this.confirmPending) {
          this.confirmPending = true;
          item.textContent = '再次确认：立即清除数据？(Enter)';
          return;
        }
        this.confirmPending = false;
      }
      this.exec(item.dataset.action);
    },

    exec(action) {
      switch (action) {
        case 'reboot-system':
        case 'restart-bootloader':
          OS.state.transition('boot', { source: action });
          break;
        case 'power-off':
          OS.state.transition('poweroff', { source: action });
          break;
        case 'factory-reset':
          this._resetDone();
          break;
        default:
          console.warn('[modes] unknown action:', action);
      }
    },

    /* 模拟清除数据 -> 提示完成 -> 自动重启 */
    _resetDone() {
      if (!this.menu) return;
      this.menu.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'sel';
      li.textContent = '数据已清除，正在重启…';
      this.menu.appendChild(li);
      setTimeout(() => OS.state.transition('boot', { source: 'factory-reset-done' }), 1800);
    }
  };

  OS.reg('modes', MODES);
})(window);
