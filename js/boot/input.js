/* ============================================================
 * nsos - input.js (P1 · P6 快捷键增强)
 * 系统输入层：键盘事件 -> 统一语义键，广播到事件总线。
 * 模拟真实硬件键：音量键 / 导航键 / 确认键 / 返回键
 *
 *   ↑ / ↓    -> 导航 nav:up / nav:down
 *   Enter/空格 -> 确认 select
 *   -         -> 音量下 vol-down
 *   = / +     -> 音量上 vol-up
 *   Esc       -> 返回 back
 *   1-9       -> 数字 digit:N（Fastboot/Recovery 快捷选择）
 *
 * P6 快捷键：
 *   Ctrl+Shift+S  -> 截屏
 *   Ctrl+Shift+T  -> 切换主题
 *   Ctrl+Shift+W  -> 切换壁纸
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const KEYMAP = {
    ArrowUp:   { type: 'nav', dir: 'up' },
    ArrowDown: { type: 'nav', dir: 'down' },
    Enter:     { type: 'select' },
    ' ':       { type: 'select' },
    '-':       { type: 'key', key: 'vol-down' },
    '=':       { type: 'key', key: 'vol-up' },
    '+':       { type: 'key', key: 'vol-up' },
    Escape:    { type: 'back' }
  };

  OS.reg('input', {
    start() {
      document.addEventListener('keydown', (e) => {
        // 截屏：Ctrl+Shift+S
        if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
          e.preventDefault();
          this._captureScreenshot();
          return;
        }
        // 切换主题：Ctrl+Shift+T
        if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
          e.preventDefault();
          if (OS.launcher && OS.launcher._toggleTheme) OS.launcher._toggleTheme();
          return;
        }
        // 切换壁纸：Ctrl+Shift+W
        if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
          e.preventDefault();
          if (OS.launcher && OS.launcher._cycleWallpaper) OS.launcher._cycleWallpaper();
          return;
        }
        // 数字键
        if (/^[1-9]$/.test(e.key)) {
          OS.bus.emit('input:key', { type: 'digit', digit: Number(e.key) });
          return;
        }
        const mapped = KEYMAP[e.key];
        if (mapped) {
          e.preventDefault();
          OS.bus.emit('input:key', mapped);
        }
      });
    },

    /* 截屏效果：屏幕闪白 + Toast */
    _captureScreenshot() {
      const root = document.getElementById('os-root');
      if (!root) return;
      // 闪白效果
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;opacity:0;pointer-events:none;transition:opacity .15s ease;';
      root.appendChild(flash);
      requestAnimationFrame(() => {
        flash.style.opacity = '.8';
        setTimeout(() => {
          flash.style.opacity = '0';
          setTimeout(() => flash.remove(), 300);
        }, 100);
      });
      // Toast 提示
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('已截屏', { ms: 1500 });
      // 发布事件（灵动岛监听）
      OS.bus.emit('screenshot:taken', { time: Date.now() });
      // 发布通知
      if (OS.notify) {
        OS.notify.post({ icon: 'image', title: '截屏已保存', text: '屏幕截图已保存到相册', app: 'photos' });
      }
    }
  });
})(window);
