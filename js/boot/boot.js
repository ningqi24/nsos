/* ============================================================
 * nsos - boot.js (P1.1 ~ P1.3 / P1.7)
 * BootManager：控制开机流程
 *   bootloader(Logo 2s) -> 开机动画(2.6s) -> locked
 *   Bootloader 阶段：
 *     音量下 -> Fastboot
 *     音量上 -> Recovery
 *   进入开机动画后不再受理工程模式入口
 *   关机状态下任意键重新开机
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const BOOT = {
    seq: 'bootloader',   // bootloader | animation
    interrupt: null,     // 'fastboot' | 'recovery' | null
    timers: [],

    /* 进入 boot 状态统一入口
     * opts.stayBootloader=true 时停留在 Bootloader（logo + 工程模式入口），
     * 不自动跑开机动画；无操作 10s 后自动正常启动，避免卡死。 */
    start(opts = {}) {
      this.seq = 'bootloader';
      this.interrupt = null;
      this.stayBootloader = !!opts.stayBootloader;
      this._clearTimers();

      this._show('layer-bootloader');
      this._hide('layer-boot-anim');

      if (this.stayBootloader) {
        this._timer(() => {
          if (this.seq === 'bootloader') this._runAnimation();
        }, 10000);
        return;
      }

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

    /* Logo 阶段的隐藏入口（音量下 -> Fastboot，音量上 -> Recovery）。
     * 仅 bootloader 阶段响应，进入开机动画后不再受理。 */
    _handleKey(e) {
      if (this.seq !== 'bootloader') return;
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

  // 进入 boot 启动流程（透传 payload，支持 stayBootloader）；离开 boot 清理定时器
  OS.state.onEnter('boot', (info) => BOOT.start((info && info.payload) || {}));
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

  // Bootloader 停留模式（重启到 Bootloader 后）：点击 logo 区域立即正常启动系统
  document.addEventListener('click', (e) => {
    if (OS.state.current !== 'boot' || BOOT.seq !== 'bootloader' || !BOOT.stayBootloader) return;
    if (e.target.closest('.boot-key')) return;
    BOOT._runAnimation();
  });

  // 关机状态下任意键开机
  OS.bus.on('input:key', () => {
    if (OS.state.current === 'poweroff') {
      OS.state.transition('boot', { source: 'power-on' });
    }
  });
})(window);
