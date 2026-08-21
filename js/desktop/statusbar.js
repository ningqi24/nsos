/* ============================================================
 * nsos - statusbar.js (P2.2)
 * 状态栏服务：常驻 os-sysui，显示时间 / 信号 / 电量。
 * 所有系统界面（锁屏/桌面/应用）上方常驻。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const SB = {
    el: null,
    timeEl: null,

    init() {
      const host = document.getElementById('os-sysui');
      if (!host) return;

      // 构建状态栏 DOM
      const bar = document.createElement('div');
      bar.id = 'sys-statusbar';
      bar.innerHTML = `
        <div class="sb-left">
          <span class="sb-signal"><i></i><i></i><i></i><i></i></span>
          <span class="sb-time"></span>
        </div>
        <div class="sb-right">
          <span class="sb-battery"><i></i></span>
        </div>`;
      host.appendChild(bar);

      this.el = bar;
      this.timeEl = bar.querySelector('.sb-time');

      this._tick();
      setInterval(() => this._tick(), 30000);
    },

    _tick() {
      if (!this.timeEl) return;
      const d = new Date();
      this.timeEl.textContent =
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  };

  OS.reg('statusbar', SB);
})(window);
