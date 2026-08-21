/* ============================================================
 * nsos - input.js (P1)
 * 系统输入层：键盘事件 -> 统一语义键，广播到事件总线。
 * 模拟真实硬件键：音量键 / 导航键 / 确认键 / 返回键
 *
 *   ↑ / ↓    -> 导航 nav:up / nav:down
 *   Enter/空格 -> 确认 select
 *   -         -> 音量下 vol-down
 *   = / +     -> 音量上 vol-up
 *   Esc       -> 返回 back
 *   1-9       -> 数字 digit:N（Fastboot/Recovery 快捷选择）
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
    }
  });
})(window);
