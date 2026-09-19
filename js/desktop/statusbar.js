/* ============================================================
 * nsos - statusbar.js (P2.2 / P5 现代化升级)
 * 状态栏服务：常驻 os-sysui，显示时间 / 信号 / WiFi / 真实电量。
 * 电量来自 OS.device 真实读取，实时监听 levelchange/chargingchange 变化。
 * P5 增强：WiFi 图标 / 运营商 / 蓝牙图标 / 闹钟图标
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

      // 构建状态栏 DOM（P5 增强：WiFi + 运营商）
      const bar = document.createElement('div');
      bar.id = 'sys-statusbar';
      bar.innerHTML = `
        <div class="sb-left">
          <span class="sb-signal" data-strength="4" aria-hidden="true">
            <svg viewBox="0 0 18 12">
              <rect class="sb-sig-bar b1" x="0"  y="7"   width="3" height="5"    rx="1"/>
              <rect class="sb-sig-bar b2" x="5"  y="4.5" width="3" height="7.5"  rx="1"/>
              <rect class="sb-sig-bar b3" x="10" y="2"   width="3" height="10"   rx="1"/>
              <rect class="sb-sig-bar b4" x="15" y="0"   width="3" height="12"   rx="1"/>
            </svg>
          </span>
          <span class="sb-carrier">nsos</span>
          <span class="sb-wifi"><os-icon name="wifi" size="13"></os-icon></span>
          <span class="sb-time"></span>
        </div>
        <div class="sb-right">
          <span class="sb-bt-icon"><os-icon name="bluetooth" size="13"></os-icon></span>
          <span class="sb-battery" role="img" aria-label="电量">
            <svg class="sb-bat-svg" viewBox="0 0 27 13" aria-hidden="true">
              <rect class="sb-bat-shell" x="0.75" y="0.75" width="22.5" height="11.5" rx="3.75"/>
              <rect class="sb-bat-fill"  x="2.25" y="2.25" width="19.5" height="8.5"  rx="2.25"/>
              <path class="sb-bat-cap" d="M25 4.2a1.6 1.6 0 0 1 0 4.6z"/>
              <path class="sb-bat-bolt" d="M11.6 2.3 8.1 7.2h2.6l-1 3.5 3.6-5.1h-2.6z"/>
            </svg>
            <b class="sb-bat-pct">--%</b>
          </span>
        </div>`;
      host.appendChild(bar);

      this.el = bar;
      this.timeEl = bar.querySelector('.sb-time');
      this.batFill = bar.querySelector('.sb-bat-fill');
      this.batPct = bar.querySelector('.sb-bat-pct');
      this.batEl = bar.querySelector('.sb-battery');
      this.wifiEl = bar.querySelector('.sb-wifi');
      this.btEl = bar.querySelector('.sb-bt-icon');

      this._tick();
      setInterval(() => this._tick(), 1000);
      this._updateBattery();
      this._updateConnectivity();
      // 设备信息更新时刷新（含电量实时变化）
      OS.bus.on('device:update', () => this._updateBattery());

      // 控制中心开关变化时更新状态栏
      OS.bus.on('cc:toggle', (e) => {
        if (e.id === 'wifi') this.wifiEl.style.opacity = e.on ? '1' : '.3';
        if (e.id === 'bluetooth') this.btEl.style.opacity = e.on ? '.8' : '.2';
      });

      // 初始化时读取存储的开关状态
      const wifiOn = OS.storage.get('cc:wifi', true);
      const btOn = OS.storage.get('cc:bluetooth', false);
      this.wifiEl.style.opacity = wifiOn ? '1' : '.3';
      this.btEl.style.opacity = btOn ? '.8' : '.2';
    },

    _tick() {
      if (!this.timeEl) return;
      const d = new Date();
      const showSec = OS.storage.get('settings:showsec', false);
      if (showSec) {
        this.timeEl.textContent =
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      } else {
        this.timeEl.textContent =
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    },

    /* 真实电量：读取 OS.device.battery；不可用时回退到"不可用"而非伪造 */
    _updateBattery() {
      if (!this.batFill || !this.batPct) return;
      const showPct = OS.storage.get('settings:batpct', true);
      this.batPct.style.display = showPct ? '' : 'none';
      const b = OS.device && OS.device.battery;
      if (b && OS.device.batterySupported) {
        const level = Math.round(b.level * 100);
        const wasCharging = this._prevCharging;
        // SVG 填充用 CSS 变量缩放（0~1），不再依赖宽度百分比
        this.batEl.style.setProperty('--bat-level', Math.max(0, Math.min(1, b.level)).toFixed(3));
        this.batPct.textContent = level + '%';
        this.batEl.classList.toggle('charging', !!b.charging);

        // 充电接入瞬间：闪绿色光效
        if (b.charging && !wasCharging) {
          this._showChargeBurst();
          this._showChargeToast(level);
        }
        this._prevCharging = !!b.charging;

        // 低电量着色 + 横幅提醒（着色由 .low 类控制）
        if (level <= 20 && !b.charging) {
          this.batEl.classList.add('low');
          // 低电量横幅
          if (level <= 15 && !this._lowBatNotified) {
            this._lowBatNotified = true;
            this._showLowBatteryBanner(level);
            if (OS.notify) {
              OS.notify.post({ icon: 'battery', title: '低电量', text: `电量剩余 ${level}%，请尽快充电`, app: 'settings' });
            }
          }
        } else {
          this.batEl.classList.remove('low');
          if (level > 20) this._lowBatNotified = false;
        }
      } else {
        this.batEl.style.setProperty('--bat-level', '0');
        this.batPct.textContent = '--%';
      }
    },

    /* 充电闪屏动画 */
    _showChargeBurst() {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const burst = document.createElement('div');
      burst.className = 'charge-burst';
      sysui.appendChild(burst);
      setTimeout(() => burst.remove(), 900);
    },

    /* 充电 Toast 提示 */
    _showChargeToast(level) {
      const toast = OS.ui && OS.ui.toast;
      if (toast) toast('正在充电 ' + level + '%', { ms: 1500 });
    },

    /* 低电量横幅 */
    _showLowBatteryBanner(level) {
      const sysui = document.getElementById('os-sysui');
      if (!sysui) return;
      const banner = document.createElement('div');
      banner.className = 'battery-low-banner';
      banner.innerHTML = `<span class="blb-ic"><os-icon name="battery" size="16"></os-icon></span><span>电量仅剩 ${level}%，请尽快充电</span>`;
      sysui.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add('show'));
      setTimeout(() => {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 500);
      }, 4000);
    },

    /* 连通性状态（模拟）：data-strength 控制信号点亮格数 */
    _updateConnectivity() {
      const sig = this.el.querySelector('.sb-signal');
      if (sig) sig.dataset.strength = '4';
    },
  };

  OS.reg('statusbar', SB);
})(window);
