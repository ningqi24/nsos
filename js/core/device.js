/* ============================================================
 * nsos - device.js (P1.8)
 * 真实设备信息模块：读取浏览器/系统实际提供的信息。
 *   电量/充电状态  Battery Status API
 *   屏幕            screen / devicePixelRatio
 *   系统/型号        userAgent / userAgentData
 *   网络            Network Information API（effectiveType）
 *   内存/核心数      deviceMemory / hardwareConcurrency
 *   存储            navigator.storage.estimate()
 * 说明：若某 API 受浏览器安全策略限制（如桌面端 Battery 返回 undefined），
 *       对应字段报告为 "不可用"，绝不伪造数值。
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  const DEVICE = {
    battery: null,       // navigator.getBattery() promise 结果
    batterySupported: false,
    info: {              // 最新快照（字符串友好）
      battery: '—', charging: '—',
      model: '—', platform: '—', osBrowser: '—',
      screen: '—', dpr: '—',
      network: '—', online: '—',
      memory: '—', cores: '—',
      language: '—', ua: '—',
      storage: '—', touch: '—'
    },

    /* 解析 UA 得到尽量可读的"型号" */
    _parseModel(ua) {
      const uaData = navigator.userAgentData;
      if (uaData && uaData.getHighEntropyValues) {
        // 高熵信息为异步、可能被拒，先取低熵的 platform + mobile
        return { platform: uaData.platform || 'unknown', mobile: !!uaData.mobile };
      }
      const low = new RegExp('; (' + [
        'Android [\\d.]+; [^;)]+',
        'iPhone; CPU iPhone OS [\\d_]+ like Mac OS X',
        'iPad; CPU OS [\\d_]+ like Mac OS X',
        'Windows NT [\\d.]+',
        'Macintosh; Intel Mac OS X [\\d_]+',
        'Linux; .*'
      ].join('|') + ')', 'i').exec(ua);
      const raw = low ? low[1] : ua.split(')')[0];
      // Android 例子：Android 14; Pixel 8
      let model = raw;
      const m = /Android [\d.]+; ([^;)]+)/.exec(ua);
      if (m) model = m[1].trim();
      return { platform: raw, mobile: /Mobile|iPhone|iPad|Android/.test(ua) };
    },

    async _readBattery() {
      try {
        if (navigator.getBattery) {
          this.battery = await navigator.getBattery();
          this.batterySupported = true;
          // 监听实时变化
          this.battery.addEventListener('levelchange', () => this._emit());
          this.battery.addEventListener('chargingchange', () => this._emit());
        }
      } catch (e) {
        this.batterySupported = false;
      }
    },

    async _readStorage() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          return est.usage + ' / ' + est.quota;
        }
      } catch (e) { /* ignore */ }
      return null;
    },

    /* 重新采集全部信息 */
    async refresh() {
      const conn = navigator.connection || (navigator.mozConnection) || null;
      const ua = navigator.userAgent || '';
      const parsed = this._parseModel(ua);
      const dpr = window.devicePixelRatio || 1;
      const mem = navigator.deviceMemory;          // 可能 undefined
      const cores = navigator.hardwareConcurrency; // 可能 undefined

      let batteryTxt = '不可用', chargingTxt = '不可用';
      if (this.batterySupported && this.battery) {
        batteryTxt = Math.round(this.battery.level * 100) + ' %';
        chargingTxt = this.battery.charging ? '充电中' : '未充电';
      }
      const net = conn ? (conn.effectiveType || 'unknown')
          + ' (' + (conn.downlink || '?') + ' Mbps)' : '不可用';
      const storage = await this._readStorage();
      const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

      this.info = {
        battery: batteryTxt,
        charging: chargingTxt,
        model: parsed.model,
        platform: parsed.platform,
        osBrowser: ua.split(')')[0].split('(')[1] || '不可用',
        screen: screen.width + ' x ' + screen.height,
        dpr: dpr + 'x',
        network: net,
        online: navigator.onLine ? '在线' : '离线',
        memory: mem ? (mem + ' GB') : '不可用',
        cores: cores ? (cores + ' 核') : '不可用',
        language: navigator.language || '不可用',
        storage: storage || '不可用',
        touch: touch ? '支持' : '不支持',
        ua: ua
      };
      this._emit();
      return this.info;
    },

    _emit() {
      OS.bus.emit('device:update', { info: this.info });
    }
  };

  OS.reg('device', DEVICE);

  /* 启动时初始化（保持非阻塞） */
  (async function init() {
    await DEVICE._readBattery();
    await DEVICE.refresh();
  })();
})(window);
