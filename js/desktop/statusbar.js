/* ============================================================
 * nsos - statusbar.js (P2.2 / 升级)
 * 状态栏服务：常驻 os-sysui，显示时间 / 信号 / 真实电量（Battery API）。
 * 电量来自 OS.device 真实读取，实时监听 levelchange/chargingchange 变化。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const SB = {
    el: null,
    timeEl: null,
    batEl: null,
    batFill: null,
    batPct: null,

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
          <span class="sb-battery"><i class="sb-bat-fill"></i><b class="sb-bat-pct">--%</b></span>
        </div>`;
      host.appendChild(bar);

      this.el = bar;
      this.timeEl = bar.querySelector('.sb-time');
      this.batFill = bar.querySelector('.sb-bat-fill');
      this.batPct = bar.querySelector('.sb-bat-pct');
      this.batEl = bar.querySelector('.sb-battery');

      this._tick();
      setInterval(() => this._tick(), 30000);
      this._updateBattery();
      // 设备信息更新时刷新（含电量实时变化）
      OS.bus.on('device:update', () => this._updateBattery());
    },

    _tick() {
      if (!this.timeEl) return;
      const d = new Date();
      this.timeEl.textContent =
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    /* 真实电量：读取 OS.device.battery；不可用时回退到"不可用"而非伪造 */
    _updateBattery() {
      if (!this.batFill || !this.batPct) return;
      const b = OS.device && OS.device.battery;
      if (b && OS.device.batterySupported) {
        const level = Math.round(b.level * 100);
        this.batFill.style.width = level + '%';
        this.batPct.textContent = level + '%';
        this.batEl.classList.toggle('charging', !!b.charging);
      } else {
        this.batFill.style.width = '0%';
        this.batPct.textContent = '--%';
      }
    }
  };

  OS.reg('statusbar', SB);
})(window);
