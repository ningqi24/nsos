/* ============================================================
 * nsos - boot.js (P1.1 ~ P1.3 / P1.7)
 * BootManager：控制开机流程
 *   bootloader(Logo 2s) -> 开机动画(2.6s) -> locked
 *   开机动画期间：
 *     音量下 -> Fastboot
 *     音量上 -> Recovery
 *   关机状态下任意键重新开机
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const BOOT = {
    seq: 'bootloader',   // bootloader | animation
    interrupt: null,     // 'fastboot' | 'recovery' | null
    timers: [],

    /* 进入 boot 状态统一入口 */
    start() {
      this.seq = 'bootloader';
      this.interrupt = null;
      this._clearTimers();

      this._show('layer-bootloader');
      this._hide('layer-boot-anim');

      // Logo 点亮停留 2s，然后进入开机动画
      this._timer(() => this._runAnimation(), 2000);
    },

    /* 开机动画：转圈 + 进度条 0 -> 100% */
    _runAnimation() {
      this.seq = 'animation';
      this._hide('layer-bootloader');
      this._show('layer-boot-anim');

      const bar = document.getElementById('boot-progress');
      if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          bar.style.transition = 'width 2600ms cubic-bezier(.22,.61,.36,1)';
          bar.style.width = '100%';
        }));
      }

      // 动画完成 -> 正常进入锁屏（若未被按键打断）
      this._timer(() => {
        if (!this.interrupt) OS.state.transition('locked', { source: 'boot-complete' });
      }, 2600);
    },

    /* Logo 与开机动画期间的隐藏入口（音量下 -> Fastboot，音量上 -> Recovery） */
    _handleKey(e) {
      if (this.seq !== 'bootloader' && this.seq !== 'animation') return;
      if (e.type === 'key' && e.key === 'vol-down') {
        this.interrupt = 'fastboot';
        OS.state.transition('fastboot', { source: 'vol-down' });
      } else if (e.type === 'key' && e.key === 'vol-up') {
        this.interrupt = 'recovery';
        OS.state.transition('recovery', { source: 'vol-up' });
      }
    },

    _timer(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; },
    _clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; },
    _show(id) { const el = document.getElementById(id); if (el) el.hidden = false; },
    _hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }
  };

  OS.reg('boot', BOOT);

  // 进入 boot 启动流程；离开 boot 清理定时器
  OS.state.onEnter('boot', () => BOOT.start());
  OS.state.onLeave('boot', () => BOOT._clearTimers());

  // 开机动画隐藏入口
  OS.bus.on('input:key', (e) => BOOT._handleKey(e));

  // 底部虚拟音量键（手机端无实体键盘/音量键时可用）
  document.addEventListener('click', (e) => {
    const k = e.target.closest('.boot-key');
    if (!k || OS.state.current !== 'boot') return;
    const vol = k.dataset.vol;
    if (vol === 'down' || vol === 'up') {
      OS.bus.emit('input:key', { type: 'key', key: 'vol-' + vol });
    }
  });

  // 关机状态下任意键开机
  OS.bus.on('input:key', () => {
    if (OS.state.current === 'poweroff') {
      OS.state.transition('boot', { source: 'power-on' });
    }
  });
})(window);
