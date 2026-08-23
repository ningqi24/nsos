/* ============================================================
 * nsos - os-settings (Web Component)
 * 真实设置应用：设备信息 + 系统更新。
 *   - 设备信息：真实读取 OS.device / OS.version / bootloader 状态
 *   - 系统更新：真实扫描 /sdcard OTA 包并与 OS.version 对比，
 *     发现新版本后引导「重启到 Recovery」→ 由工程模式 GUI 安装
 *     （modes.js 的 ota-gui），安装进度复用 shell.updater 单一进度源。
 * 纯标准 Custom Element + Shadow DOM + Design Token，无依赖。
 * ============================================================ */
(function () {
  'use strict';

  const OS = window.OS;

  const TEMPLATE = `
    <style>
      :host {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        background: #0c0f1e;
        color: #e8eef5;
      }
      .st-tabs {
        flex: none;
        display: flex; gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,.07);
        background: rgba(255,255,255,.03);
      }
      .st-tab {
        flex: 1;
        padding: 9px 0;
        border: 1px solid var(--os-border, rgba(255,255,255,.1));
        border-radius: var(--os-radius-md, 12px);
        background: var(--os-glass, rgba(255,255,255,.06));
        color: var(--os-fg-1, rgba(255,255,255,.7));
        font-size: var(--os-font-md, 14px);
        font-weight: var(--os-font-weight-mid, 600);
        cursor: pointer;
        transition: all var(--os-dur-fast, .15s);
        -webkit-tap-highlight-color: transparent;
      }
      .st-tab.active { background: var(--os-accent, #ef9f37); color: #fff; border-color: transparent; }
      .st-panel { flex: 1 1 auto; overflow-y: auto; padding: 16px 14px 24px; min-height: 0; }
      .st-panel[hidden] { display: none; }

      .st-card {
        background: rgba(255,255,255,.04);
        border: 1px solid var(--os-border, rgba(255,255,255,.1));
        border-radius: var(--os-radius-lg, 18px);
        padding: 16px;
        margin-bottom: 14px;
      }
      .st-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #fff; }

      .st-row {
        display: flex; justify-content: space-between; gap: 12px;
        padding: 8px 2px;
        border-bottom: 1px solid rgba(255,255,255,.05);
        font-size: 13px;
      }
      .st-row:last-child { border-bottom: none; }
      .st-row span { color: #8a938a; flex: none; }
      .st-row b { color: #e8efe8; font-weight: 600; text-align: right; word-break: break-all; }

      .st-btn {
        width: 100%;
        padding: 12px 0;
        border: none; border-radius: var(--os-radius-md, 12px);
        background: var(--os-accent, #ef9f37); color: #fff;
        font-size: 14px; font-weight: 700; cursor: pointer;
        transition: transform var(--os-dur-fast, .15s), opacity var(--os-dur-fast, .15s);
      }
      .st-btn:active { transform: scale(.97); }
      .st-btn.ghost { background: var(--os-glass, rgba(255,255,255,.06)); border: 1px solid var(--os-border, rgba(255,255,255,.1)); color: var(--os-fg-1, rgba(255,255,255,.7)); }
      .st-btn.disabled { opacity: .4; pointer-events: none; }

      .st-ver {
        display: flex; align-items: baseline; justify-content: space-between;
        padding: 6px 0 14px; border-bottom: 1px dashed rgba(255,255,255,.1);
      }
      .st-ver .cur { font-size: 26px; font-weight: 800; color: #fff; letter-spacing: .5px; }
      .st-ver .cur small { font-size: 12px; color: #8a938a; font-weight: 400; margin-left: 8px; }
      .st-ver .tag { font-size: 12px; color: var(--os-teal, #35c4a2); }

      .st-pkg {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 10px 2px;
        border-bottom: 1px solid rgba(255,255,255,.06);
        font-size: 13px;
      }
      .st-pkg:last-child { border-bottom: none; }
      .st-pkg .pkg-name { color: #e8efe8; word-break: break-all; }
      .st-pkg .pkg-ver { color: #8a938a; font-size: 12px; }
      .st-pkg b.ok { color: var(--os-success, #3ecf6e); }
      .st-pkg b.warn { color: var(--os-warning, #ef9f37); }
      .st-pkg button {
        flex: none; padding: 6px 14px; border: none; border-radius: var(--os-radius-sm, 8px);
        background: var(--os-accent, #ef9f37); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .st-pkg button.ghost { background: transparent; border: 1px solid var(--os-border, rgba(255,255,255,.1)); color: #8a938a; }

      .st-hint { font-size: 12px; color: #7b848b; line-height: 1.6; margin-top: 12px; }
      .st-hint code { color: var(--os-accent-strong, #ffbd5e); }
    </style>

    <div class="st-tabs">
      <button class="st-tab active" type="button" data-tab="about">设备信息</button>
      <button class="st-tab" type="button" data-tab="update">系统更新</button>
    </div>
    <div class="st-panel" data-panel="about"></div>
    <div class="st-panel" data-panel="update" hidden></div>
  `;

  class OsSettings extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      this._about = root.querySelector('[data-panel="about"]');
      this._update = root.querySelector('[data-panel="update"]');
      root.querySelectorAll('.st-tab').forEach((tab) => {
        tab.addEventListener('click', () => this._switch(tab.dataset.tab));
      });
    }

    connectedCallback() {
      this._renderAbout();
      this._renderUpdate();
      // 电池/设备信息变化时刷新设备信息页
      this._onDevUpdate = () => { if (this.isConnected) this._renderAbout(false); };
      if (OS.bus) OS.bus.on('device:update', this._onDevUpdate);
    }

    disconnectedCallback() {
      if (OS.bus && this._onDevUpdate) OS.bus.off('device:update', this._onDevUpdate);
    }

    _switch(tab) {
      const root = this.shadowRoot;
      root.querySelectorAll('.st-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      root.querySelector('[data-panel="about"]').hidden = tab !== 'about';
      root.querySelector('[data-panel="update"]').hidden = tab !== 'update';
    }

    /* 设备信息页（真实读取，无伪造；刷新按钮走 OS.device.refresh） */
    _renderAbout() {
      const d = (OS.device && OS.device.info) || {};
      const v = OS.version || {};
      const verTxt = (v.major != null) ? 'v' + v.major + '.' + v.minor + '.' + v.build : '不可用';
      const rows = [
        ['系统版本', verTxt + ' "' + (v.codename || '') + '"'],
        ['Bootloader', (OS.shell && OS.shell.locked ? (OS.shell.locked() ? 'locked' : 'unlocked') : '不可用')],
        ['型号', d.model],
        ['平台', d.platform],
        ['浏览器/系统', d.osBrowser],
        ['电量', d.battery],
        ['充电状态', d.charging],
        ['Battery API', d.batteryAPI],
        ['屏幕', d.screen],
        ['DPI', d.dpr],
        ['内存', d.memory],
        ['CPU 核心数', d.cores],
        ['网络类型', d.network],
        ['在线状态', d.online],
        ['语言', d.language],
        ['存储使用', d.storage],
        ['触屏', d.touch]
      ].map(([k, val]) =>
        '<div class="st-row"><span>' + k + '</span><b>' +
        ((val === undefined || val === null || val === '' || val === '—') ? '不可用' : val) + '</b></div>'
      ).join('');

      const refreshBtn = '<button class="st-btn ghost" data-refresh type="button">重新采集设备信息</button>';

      this._about.innerHTML =
        '<div class="st-card"><h3>关于本机</h3>' + rows + '</div>' +
        refreshBtn +
        '<div class="st-hint">数据来自浏览器真实能力（Battery / Network / Screen 等 API）。' +
        '某 API 不被浏览器提供时如实显示「不可用」，不伪造。</div>';

      const rb = this._about.querySelector('[data-refresh]');
      if (rb && OS.device && OS.device.refresh) {
        rb.addEventListener('click', () => OS.device.refresh().then(() => {
          if (OS.ui && OS.ui.toast) OS.ui.toast('设备信息已刷新', { type: 'success', ms: 1200 });
        }));
      }
    }

    /* ---- 系统更新页：真实扫描 /sdcard OTA 包并对比版本 ---- */
    _parseV(name) {
      const m = /^nsos-ota-v?(\d+)\.(\d+)\.(\d+)\.zip$/.exec(name);
      return m ? { major: +m[1], minor: +m[2], build: +m[3], s: name } : null;
    }
    _newer(a, b) {
      return a.major > b.major ||
        (a.major === b.major && a.minor > b.minor) ||
        (a.major === b.major && a.minor === b.minor && a.build > b.build);
    }
    _scanPkgs() {
      const sdcard = (OS.shell && OS.shell.VFS && OS.shell.VFS.tree['/sdcard']) || [];
      return sdcard.map((n) => this._parseV(n)).filter(Boolean)
        .sort((a, b) => a.major - b.major || a.minor - b.minor || a.build - b.build);
    }

    _renderUpdate() {
      const v = OS.version || {};
      const curS = (v.major != null) ? 'v' + v.major + '.' + v.minor + '.' + v.build : '?';
      const pkgs = this._scanPkgs();
      const latest = pkgs.length ? pkgs[pkgs.length - 1] : null;
      const hasNew = !!latest && this._newer(latest, v);
      const inRecovery = OS.state && OS.state.current === 'recovery';

      const rows = pkgs.length ? pkgs.map((p) => {
        const st = this._newer(p, v) ? '可更新' : (p.major === v.major && p.minor === v.minor && p.build === v.build ? '当前版本' : '旧版本');
        const cls = st === '可更新' ? 'ok' : (st === '当前版本' ? '' : 'warn');
        return '<div class="st-pkg"><span><span class="pkg-name">' + p.s + '</span> ' +
          '<span class="pkg-ver">v' + p.major + '.' + p.minor + '.' + p.build + '</span> ' +
          '<b class="' + cls + '">' + st + '</b></span></div>';
      }).join('') : '<div class="st-hint">/sdcard 无更新包。</div>';

      const action = hasNew
        ? (inRecovery
            ? '<button class="st-btn" data-torecovery type="button">在 Recovery 中应用更新</button>'
            : '<button class="st-btn" data-torecovery type="button">重启到 Recovery 安装更新</button>')
        : (pkgs.length
            ? '<button class="st-btn ghost disabled" type="button" disabled>已是最新版本</button>'
            : '<button class="st-btn ghost disabled" type="button" disabled>暂无更新包</button>');

      this._update.innerHTML =
        '<div class="st-card"><h3>当前版本</h3>' +
        '<div class="st-ver"><span class="cur">' + curS + '<small>' + (v.codename || '') + '</small></span>' +
        '<span class="tag">' + (hasNew ? '发现新版本 v' + latest.major + '.' + latest.minor + '.' + latest.build : '已是最新') + '</span></div>' +
        '<h3 style="margin-top:16px">更新包（/sdcard）</h3>' + rows + '</div>' +
        action +
        '<div class="st-hint">安装流程：<code>检查更新 → 重启到 Recovery → 从 /sdcard 应用更新 → 重启系统</code>。' +
        '安装界面在 Recovery 工程模式中提供（仅可升级、不可降级）。</div>';

      const btn = this._update.querySelector('[data-torecovery]');
      if (btn) btn.addEventListener('click', () => this._goRecovery());
    }

    _goRecovery() {
      if (!OS.shell) return;
      if (OS.state && OS.state.current === 'recovery') {
        // 已在 recovery：GUI 安装入口由 nodes.js/modes.js ota-gui 提供，
        // 这里通过提示引导；用户关闭设置窗后走工程模式菜单。
        if (OS.ui && OS.ui.toast) OS.ui.toast('请在 Recovery 菜单选择「从 /sdcard 应用更新」', { type: 'info', ms: 2200 });
        return;
      }
      if (OS.ui && OS.ui.toast) OS.ui.toast('正在重启到 Recovery ...', { type: 'info', ms: 1500 });
      OS.shell.exec('reboot recovery');
    }
  }

  if (!customElements.get('os-settings')) customElements.define('os-settings', OsSettings);
})();
